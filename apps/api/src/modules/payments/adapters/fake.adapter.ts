import { createHash } from 'node:crypto'
import type { PaymentMethod } from '@biztrack/types'
import type {
  InitiateUssdPushRequest,
  PaymentProviderAdapter,
  ProviderEvent,
  ProviderTxnState,
} from './payment-provider.adapter'

/**
 * A deterministic, network-free adapter used to prove the pipeline end-to-end before real provider
 * sandboxes are wired (Stripe = build 8, MTN = build 13). It NEVER moves money. verifyCredentials
 * treats any credential value containing "invalid" as a failed key, otherwise reports the provider's
 * catalogue methods. Execution methods produce deterministic pseudo-refs and a PENDING state.
 *
 * TODO(sandbox): replace registration of this with the real Stripe/MTN adapters when credentials
 * exist. Keeping the same interface means that swap is a registry change, not a caller change.
 */
export class FakeProviderAdapter implements PaymentProviderAdapter {
  constructor(
    readonly code: string,
    private readonly methods: PaymentMethod[],
  ) {}

  async verifyCredentials(credentials: Record<string, string>) {
    const bad = Object.values(credentials).some((v) => v.toLowerCase().includes('invalid'))
    return bad
      ? { valid: false, enabledMethods: [], error: 'Credentials rejected (fake adapter).' }
      : { valid: true, enabledMethods: this.methods, accountRef: `fake_${this.code.toLowerCase()}` }
  }

  private ref(seed: string): string {
    return `fake_${this.code.toLowerCase()}_${createHash('sha256').update(seed).digest('hex').slice(0, 16)}`
  }

  async getTransaction(_c: Record<string, string>, providerRef: string): Promise<ProviderTxnState> {
    return { status: 'PENDING', providerRef }
  }

  async createPaymentLink(
    _c: Record<string, string>,
    req: { reference: string; expiresInSeconds: number },
  ) {
    const providerRef = this.ref(req.reference)
    return {
      providerRef,
      url: `https://fake.pay/${providerRef}`,
      expiresAt: new Date(Date.now() + req.expiresInSeconds * 1000).toISOString(),
    }
  }

  async initiateUssdPush(_c: Record<string, string>, req: InitiateUssdPushRequest) {
    return { providerRef: this.ref(req.reference), status: 'PENDING' as const }
  }

  verifyWebhookSignature(): boolean {
    // The fake accepts everything; real adapters MUST verify (HMAC + timingSafeEqual).
    return true
  }

  parseWebhook(rawBody: Buffer): ProviderEvent {
    const parsed = JSON.parse(rawBody.toString('utf8')) as Partial<ProviderEvent>
    return {
      providerRef: parsed.providerRef ?? '',
      status: parsed.status ?? 'PENDING',
      amountXaf: parsed.amountXaf,
      eventId: parsed.eventId ?? this.ref(rawBody.toString('utf8')),
      raw: parsed,
    }
  }
}
