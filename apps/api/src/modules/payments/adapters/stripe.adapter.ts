import { Logger } from '@nestjs/common'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { PaymentMethod } from '@biztrack/types'
import type {
  PaymentAttemptStatus,
  PaymentProviderAdapter,
  ProviderEvent,
  ProviderTxnState,
  VerifyCredentialsResult,
} from './payment-provider.adapter'

const DEFAULT_STRIPE_HOST = 'https://api.stripe.com'
/** Stripe's default replay window for webhook timestamps (seconds). */
const SIGNATURE_TOLERANCE_S = 300

/** The slices of Stripe's JSON we read — everything else is carried through as `raw`. */
interface StripeObject {
  id?: string
  amount?: number
  amount_received?: number
  currency?: string
  status?: string
  payment_intent?: string
}
interface StripeEvent {
  id?: string
  type?: string
  data?: { object?: StripeObject }
}

/** Map a PaymentIntent status (poll) to our attempt lifecycle. */
function mapIntentStatus(status?: string): PaymentAttemptStatus {
  switch (status) {
    case 'succeeded':
      return 'CONFIRMED'
    case 'canceled':
      return 'FAILED'
    default:
      // requires_payment_method / requires_confirmation / requires_action / processing / … — not settled.
      return 'PENDING'
  }
}

/** Map a webhook event type to our attempt lifecycle. Types we don't act on map to PENDING; their
 * object ref won't match a live attempt, so applyProviderEvent no-ops on them. */
function mapEventType(type?: string): PaymentAttemptStatus {
  switch (type) {
    case 'payment_intent.succeeded':
    case 'charge.succeeded':
      return 'CONFIRMED'
    case 'payment_intent.payment_failed':
    case 'charge.failed':
    case 'payment_intent.canceled':
      return 'FAILED'
    default:
      return 'PENDING'
  }
}

/**
 * Spec 07 build 8 — the real Stripe adapter (API_KEY auth, restricted secret key `rk_…`).
 *
 * verifyCredentials proves the key against the Stripe API (a 401 is a bad key; anything that
 * authenticates — including a 403 from a narrowly-scoped restricted key — is valid). verifyWebhook
 * Signature is REAL: HMAC-SHA256 over `${t}.${payload}` against the `whsec_…` signing secret, with
 * Stripe's replay-tolerance and a timing-safe compare. parseWebhook maps a PaymentIntent/charge event
 * to a ProviderEvent; getTransaction polls a PaymentIntent as the webhook safety net.
 *
 * Execution (creating PaymentIntents / Checkout Sessions) is builds 9–12 and not wired here — an
 * adapter that verifies + receives confirmations is enough to connect, gate routing and reconcile.
 */
export class StripeAdapter implements PaymentProviderAdapter {
  readonly code = 'STRIPE'
  private readonly logger = new Logger(StripeAdapter.name)

  /** `overrideBaseUrl` (STRIPE_API_BASE_URL) forces the host — for tests/mocks; defaults to the real
   * Stripe API. */
  constructor(private readonly overrideBaseUrl?: string) {}

  private get base(): string {
    return (this.overrideBaseUrl ?? DEFAULT_STRIPE_HOST).replace(/\/+$/, '')
  }

  async verifyCredentials(credentials: Record<string, string>): Promise<VerifyCredentialsResult> {
    const key = credentials.secret_key?.trim()
    if (!key) return { valid: false, enabledMethods: [], error: 'Missing Stripe secret key.' }

    let res: Response
    try {
      res = await fetch(`${this.base}/v1/account`, {
        headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      })
    } catch {
      // Network/DNS — provider unavailable, not an invalid key. Verification retries via the sweep.
      throw new Error('Could not reach Stripe.')
    }

    if (res.status === 401)
      return { valid: false, enabledMethods: [], error: 'Stripe rejected the secret key.' }
    // 403 = the key authenticated but is scoped away from /v1/account — still a valid, working key.
    if (!res.ok && res.status !== 403) {
      const body = (await res.text()).slice(0, 300)
      this.logger.warn(`Stripe verify HTTP ${res.status}: ${body}`)
      throw new Error(`Stripe returned HTTP ${res.status}.`)
    }

    let accountRef: string | undefined
    if (res.ok) {
      const account = (await res.json()) as StripeObject
      accountRef = account.id
    }
    return { valid: true, enabledMethods: [PaymentMethod.CARD], accountRef }
  }

  async getTransaction(
    credentials: Record<string, string>,
    providerRef: string,
  ): Promise<ProviderTxnState> {
    const key = credentials.secret_key?.trim() ?? ''
    const res = await fetch(`${this.base}/v1/payment_intents/${encodeURIComponent(providerRef)}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
    })
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300)
      this.logger.warn(`Stripe getTransaction HTTP ${res.status}: ${body}`)
      throw new Error(`Stripe returned HTTP ${res.status}.`)
    }
    const intent = (await res.json()) as StripeObject
    return {
      status: mapIntentStatus(intent.status),
      providerRef: intent.id ?? providerRef,
      amountMinor: intent.amount_received ?? intent.amount,
      currency: intent.currency?.toUpperCase(),
      raw: intent,
    }
  }

  verifyWebhookSignature(
    rawBody: Buffer,
    headers: Record<string, unknown>,
    credentials: Record<string, string>,
  ): boolean {
    const secret = credentials.webhook_signing_secret?.trim()
    if (!secret) return false // webhook not set up yet — can't verify

    const header = headers['stripe-signature']
    const sig = Array.isArray(header) ? header[0] : header
    if (typeof sig !== 'string') return false

    // Header shape: `t=<unix>,v1=<hex>[,v1=<hex>...]` — Stripe may include more than one v1.
    const parts = sig.split(',').map((p) => p.split('='))
    const timestamp = parts.find(([k]) => k === 't')?.[1]
    const signatures = parts
      .filter(([k]) => k === 'v1')
      .map(([, v]) => v)
      .filter((v): v is string => !!v)
    if (!timestamp || signatures.length === 0) return false

    const t = Number(timestamp)
    if (!Number.isFinite(t)) return false
    // Reject stale/future timestamps (replay protection).
    if (Math.abs(Date.now() / 1000 - t) > SIGNATURE_TOLERANCE_S) return false

    const expected = createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody.toString('utf8')}`)
      .digest('hex')
    const expectedBuf = Buffer.from(expected)
    return signatures.some((v) => {
      const vb = Buffer.from(v)
      return vb.length === expectedBuf.length && timingSafeEqual(vb, expectedBuf)
    })
  }

  parseWebhook(rawBody: Buffer): ProviderEvent {
    const event = JSON.parse(rawBody.toString('utf8')) as StripeEvent
    const object = event.data?.object ?? {}
    // Prefer the PaymentIntent id — that's what an attempt stores as its providerRef. On a charge
    // event, `payment_intent` carries it; otherwise fall back to the object's own id.
    const providerRef = object.payment_intent ?? object.id ?? ''
    return {
      providerRef,
      status: mapEventType(event.type),
      amountMinor: object.amount_received ?? object.amount,
      currency: object.currency?.toUpperCase(),
      eventId: event.id ?? '',
      raw: event,
    }
  }
}
