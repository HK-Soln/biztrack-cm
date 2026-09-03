import { PaymentMethod } from '@biztrack/types'
import type {
  PaymentProviderAdapter,
  ProviderEvent,
  ProviderTxnState,
  VerifyCredentialsResult,
} from './payment-provider.adapter'

interface MtnTokenResponse {
  access_token?: string
  expires_in?: string
  token_type?: string
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
export class MtnAdapter implements PaymentProviderAdapter {
  readonly code = 'MTN'
  private readonly tokenCache = new Map<string, { token: string; expiresAt: number }>()

  constructor(private readonly baseUrl = 'https://api.mtn.com') {}

  private async fetchToken(credentials: Record<string, string>): Promise<string> {
    const consumerKey = credentials.consumer_key ?? ''
    const consumerSecret = credentials.consumer_secret ?? ''
    const cached = this.tokenCache.get(consumerKey)
    if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token

    const body = new URLSearchParams({ client_id: consumerKey, client_secret: consumerSecret })
    const res = await fetch(`${this.baseUrl}/v1/oauth/access_token?grant_type=client_credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    if (!res.ok) {
      throw new Error(`MTN token endpoint returned ${res.status}`)
    }
    const json = (await res.json()) as MtnTokenResponse
    if (!json.access_token) throw new Error('MTN token response had no access_token')
    const ttlMs = (Number(json.expires_in ?? '3599') || 3599) * 1000
    this.tokenCache.set(consumerKey, { token: json.access_token, expiresAt: Date.now() + ttlMs })
    return json.access_token
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
