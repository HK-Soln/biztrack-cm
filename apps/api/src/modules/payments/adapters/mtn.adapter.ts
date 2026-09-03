import { Logger } from '@nestjs/common'
import { PaymentMethod } from '@biztrack/types'
import type {
  PaymentProviderAdapter,
  ProviderEvent,
  ProviderTxnState,
  VerifyCredentialsResult,
} from './payment-provider.adapter'

/** MTN may return the token flat or wrapped in their `{ data: {...} }` envelope (their JSON
 * conventions) — accept both. */
interface MtnTokenBody {
  access_token?: string
  expires_in?: string
  token_type?: string
  data?: { access_token?: string; expires_in?: string; token_type?: string }
}

/**
 * Spec 07 build-order 13 (partial) — MTN adapter, OAuth 2.0 client-credentials.
 *
 * verifyCredentials is REAL: it exchanges the merchant's Consumer Key + Secret for a Bearer token at
 * `POST {base}/v1/oauth/access_token?grant_type=client_credentials` (body: client_id/client_secret).
 * A 200 with an access_token proves the credentials. Tokens are cached per consumer key until shortly
 * before expiry.
 *
 * TODO(sandbox): payment EXECUTION (request-to-pay / status) and webhook signature verification need
 * MTN's payment API endpoints + signing details, which aren't wired yet — those methods throw/false
 * until provided. Verification (this file's real part) is enough to connect + validate sandbox keys.
 */
const MTN_HOSTS = {
  sandbox: 'https://sandbox.api.mtn.com',
  production: 'https://api.mtn.com',
} as const

export class MtnAdapter implements PaymentProviderAdapter {
  readonly code = 'MTN'
  private readonly logger = new Logger(MtnAdapter.name)
  private readonly tokenCache = new Map<string, { token: string; expiresAt: number }>()

  /** `overrideBaseUrl` (MTN_API_BASE_URL) forces a host; otherwise it's derived per-connection from
   * the credential's `environment` (sandbox → sandbox.api.mtn.com, production → api.mtn.com). */
  constructor(private readonly overrideBaseUrl?: string) {}

  private baseUrlFor(credentials: Record<string, string>): string {
    if (this.overrideBaseUrl) return this.overrideBaseUrl
    return credentials.environment === 'sandbox' ? MTN_HOSTS.sandbox : MTN_HOSTS.production
  }

  /**
   * Read the token response as RAW TEXT and parse defensively — the shared http-client force-parses
   * on a JSON content-type and would throw before we could see MTN's status or body. This lets us log
   * exactly what MTN returned on failure and accept either the flat or `{data}`-enveloped shape.
   */
  private async fetchToken(credentials: Record<string, string>): Promise<string> {
    const consumerKey = credentials.consumer_key ?? ''
    const consumerSecret = credentials.consumer_secret ?? ''
    const cached = this.tokenCache.get(consumerKey)
    if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token

    const url = `${this.baseUrlFor(credentials)}/v1/oauth/access_token?grant_type=client_credentials`
    const host = new URL(url).host
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        client_id: consumerKey,
        client_secret: consumerSecret,
      }).toString(),
    })
    const raw = await res.text()

    if (!res.ok) {
      this.logger.warn(`MTN token HTTP ${res.status} from ${host}: ${raw.slice(0, 300)}`)
      throw new Error(`MTN returned HTTP ${res.status}.`)
    }

    let parsed: MtnTokenBody
    try {
      parsed = JSON.parse(raw) as MtnTokenBody
    } catch {
      // Body is an error/non-JSON despite the request — log it (no token present) so it's diagnosable.
      this.logger.warn(`MTN token: unparseable body from ${host}: ${raw.slice(0, 300)}`)
      throw new Error("MTN returned a response that wasn't valid JSON.")
    }

    const token = parsed.access_token ?? parsed.data?.access_token
    if (!token) {
      this.logger.warn(`MTN token: no access_token in body from ${host}: ${raw.slice(0, 200)}`)
      throw new Error('MTN response had no access_token.')
    }
    const expiresIn = parsed.expires_in ?? parsed.data?.expires_in
    const ttlMs = (Number(expiresIn ?? '3599') || 3599) * 1000
    this.tokenCache.set(consumerKey, { token, expiresAt: Date.now() + ttlMs })
    return token
  }

  async verifyCredentials(credentials: Record<string, string>): Promise<VerifyCredentialsResult> {
    if (!credentials.consumer_key || !credentials.consumer_secret) {
      return { valid: false, enabledMethods: [], error: 'Missing consumer key/secret.' }
    }
    try {
      await this.fetchToken(credentials)
      return {
        valid: true,
        enabledMethods: [PaymentMethod.MTN_MOMO],
        accountRef: credentials.consumer_key.slice(0, 6),
      }
    } catch (error) {
      // fetchToken already logged the raw MTN response; surface its clear message to the merchant.
      return {
        valid: false,
        enabledMethods: [],
        error: error instanceof Error ? error.message : 'MTN verification failed.',
      }
    }
  }

  // --- Execution + webhooks: pending the MTN payment API details (TODO sandbox) ---------------

  getTransaction(): Promise<ProviderTxnState> {
    return Promise.reject(new Error('MTN getTransaction not implemented (payment API pending).'))
  }

  verifyWebhookSignature(): boolean {
    return false // MTN webhook signing not wired yet — reject until implemented.
  }

  parseWebhook(): ProviderEvent {
    throw new Error('MTN parseWebhook not implemented (payment API pending).')
  }
}
