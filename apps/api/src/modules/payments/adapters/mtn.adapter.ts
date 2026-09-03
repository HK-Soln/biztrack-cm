import { createHttpClient } from '@biztrack/http-client'
import { PaymentMethod } from '@biztrack/types'
import type {
  PaymentProviderAdapter,
  ProviderEvent,
  ProviderTxnState,
  VerifyCredentialsResult,
} from './payment-provider.adapter'

type HttpClient = ReturnType<typeof createHttpClient>

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
const MTN_HOSTS = {
  sandbox: 'https://sandbox.api.mtn.com',
  production: 'https://api.mtn.com',
} as const

export class MtnAdapter implements PaymentProviderAdapter {
  readonly code = 'MTN'
  private readonly tokenCache = new Map<string, { token: string; expiresAt: number }>()
  private readonly clients = new Map<string, HttpClient>()

  /** `overrideBaseUrl` (MTN_API_BASE_URL) forces a host; otherwise it's derived per-connection from
   * the credential's `environment` (sandbox → sandbox.api.mtn.com, production → api.mtn.com). */
  constructor(private readonly overrideBaseUrl?: string) {}

  private baseUrlFor(credentials: Record<string, string>): string {
    if (this.overrideBaseUrl) return this.overrideBaseUrl
    return credentials.environment === 'sandbox' ? MTN_HOSTS.sandbox : MTN_HOSTS.production
  }

  /** One @biztrack/http-client per host (form-urlencoded for the token endpoint). */
  private clientFor(baseUrl: string): HttpClient {
    let client = this.clients.get(baseUrl)
    if (!client) {
      client = createHttpClient({
        baseURL: baseUrl,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      this.clients.set(baseUrl, client)
    }
    return client
  }

  private async fetchToken(credentials: Record<string, string>): Promise<string> {
    const consumerKey = credentials.consumer_key ?? ''
    const consumerSecret = credentials.consumer_secret ?? ''
    const cached = this.tokenCache.get(consumerKey)
    if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token

    const body = new URLSearchParams({ client_id: consumerKey, client_secret: consumerSecret })
    // Throws HttpError on a non-2xx (bad keys) — surfaced by verifyCredentials as invalid.
    const res = await this.clientFor(this.baseUrlFor(credentials)).post<MtnTokenResponse>(
      '/v1/oauth/access_token?grant_type=client_credentials',
      body.toString(),
    )
    if (!res.data.access_token) throw new Error('MTN token response had no access_token')
    const ttlMs = (Number(res.data.expires_in ?? '3599') || 3599) * 1000
    this.tokenCache.set(consumerKey, {
      token: res.data.access_token,
      expiresAt: Date.now() + ttlMs,
    })
    return res.data.access_token
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
