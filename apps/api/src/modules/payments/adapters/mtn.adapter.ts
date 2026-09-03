import { Logger } from '@nestjs/common'
import { PaymentMethod } from '@biztrack/types'
import type {
  PaymentProviderAdapter,
  ProviderEvent,
  ProviderTxnState,
  VerifyCredentialsResult,
} from './payment-provider.adapter'

/** MoMo sandbox host — production is a country-specific host the merchant supplies as `base_url`. */
const SANDBOX_BASE = 'https://sandbox.momodeveloper.mtn.com'

/** POST /collection/token/ response (RFC 6749 client-credentials). */
interface MomoTokenBody {
  access_token?: string
  token_type?: string
  expires_in?: number | string
}

/**
 * Spec 07 — MTN adapter on the MTN MoMo Open API (Collection product).
 *
 * verifyCredentials is REAL and product-aware:
 *   1) mint an OAuth token — POST {base}/collection/token/ with Basic(api_user:api_key) +
 *      Ocp-Apim-Subscription-Key. A 200 proves the three secrets are internally consistent.
 *   2) call a Collection-scoped read — GET {base}/collection/v1_0/account/balance. Each MoMo product
 *      has its OWN subscription key, so a wrong-product key mints a token but fails here. This makes
 *      "the key is the Collection key" a hard condition for enabling (never a test charge).
 *
 * TODO(execution): request-to-pay (POST /collection/v1_0/requesttopay, async 202), status polling
 * (GET /collection/v1_0/requesttopay/{X-Reference-Id}) and the PUT callback are the next slice —
 * getTransaction/parseWebhook throw/false until then.
 */
export class MtnAdapter implements PaymentProviderAdapter {
  readonly code = 'MTN'
  private readonly logger = new Logger(MtnAdapter.name)
  private readonly tokenCache = new Map<string, { token: string; expiresAt: number }>()

  /** `overrideBaseUrl` (MTN_API_BASE_URL) forces a host — for tests; otherwise it's the per-connection
   * `base_url` (production) when set, else the MoMo sandbox host. */
  constructor(private readonly overrideBaseUrl?: string) {}

  private baseUrlFor(credentials: Record<string, string>): string {
    if (this.overrideBaseUrl) return this.overrideBaseUrl
    const custom = credentials.base_url?.trim()
    if (custom) return custom.replace(/\/+$/, '') // per-country production host
    return SANDBOX_BASE
  }

  /** X-Target-Environment: fixed to `sandbox` in sandbox; the country string in production. */
  private targetEnv(credentials: Record<string, string>): string {
    if (credentials.environment === 'production')
      return credentials.target_environment?.trim() || 'production'
    return 'sandbox'
  }

  /** OAuth token via Basic(api_user:api_key). Cached per api_user until shortly before expiry. */
  private async fetchToken(base: string, credentials: Record<string, string>): Promise<string> {
    const apiUser = credentials.api_user?.trim() ?? ''
    const apiKey = credentials.api_key ?? ''
    const subscriptionKey = credentials.subscription_key ?? ''
    const cached = this.tokenCache.get(apiUser)
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token

    const basic = Buffer.from(`${apiUser}:${apiKey}`).toString('base64')
    const res = await fetch(`${base}/collection/token/`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Ocp-Apim-Subscription-Key': subscriptionKey,
      },
    })
    const raw = await res.text()
    if (!res.ok) {
      this.logger.warn(`MoMo token HTTP ${res.status}: ${raw.slice(0, 200)}`)
      throw new Error(
        res.status === 401
          ? 'MTN rejected the API user/key or subscription key.'
          : `MTN token request returned HTTP ${res.status}.`,
      )
    }
    let body: MomoTokenBody
    try {
      body = JSON.parse(raw) as MomoTokenBody
    } catch {
      throw new Error('MTN returned a non-JSON token response.')
    }
    if (!body.access_token) throw new Error('MTN token response had no access_token.')
    const ttlMs = (Number(body.expires_in ?? 3600) || 3600) * 1000
    this.tokenCache.set(apiUser, { token: body.access_token, expiresAt: Date.now() + ttlMs })
    return body.access_token
  }

  async verifyCredentials(credentials: Record<string, string>): Promise<VerifyCredentialsResult> {
    if (!credentials.subscription_key || !credentials.api_user || !credentials.api_key) {
      return {
        valid: false,
        enabledMethods: [],
        error: 'Enter the Collection subscription key, API user and API key.',
      }
    }
    const custom = credentials.base_url?.trim()
    if (credentials.environment === 'production' && !this.overrideBaseUrl && !custom) {
      return { valid: false, enabledMethods: [], error: 'Enter your production MoMo base URL.' }
    }
    if (custom) {
      try {
        new URL(custom)
      } catch {
        return { valid: false, enabledMethods: [], error: 'The MoMo base URL is not a valid URL.' }
      }
    }

    const base = this.baseUrlFor(credentials)
    try {
      const token = await this.fetchToken(base, credentials)
      // Collection-scoped read — proves the subscription key is the Collection product's key.
      const res = await fetch(`${base}/collection/v1_0/account/balance`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Target-Environment': this.targetEnv(credentials),
          'Ocp-Apim-Subscription-Key': credentials.subscription_key,
        },
      })
      if (!res.ok) {
        const raw = (await res.text()).slice(0, 200)
        this.logger.warn(`MoMo balance HTTP ${res.status}: ${raw}`)
        return {
          valid: false,
          enabledMethods: [],
          error:
            res.status === 401 || res.status === 403
              ? 'The subscription key is not valid for the Collection product.'
              : `MTN returned HTTP ${res.status} verifying the Collection product.`,
        }
      }
      return {
        valid: true,
        enabledMethods: [PaymentMethod.MTN_MOMO],
        accountRef: credentials.api_user.slice(0, 8),
      }
    } catch (error) {
      return {
        valid: false,
        enabledMethods: [],
        error: error instanceof Error ? error.message : 'MTN verification failed.',
      }
    }
  }

  // --- Execution + callbacks: pending the request-to-pay slice ---------------------------------

  getTransaction(): Promise<ProviderTxnState> {
    return Promise.reject(new Error('MTN getTransaction not implemented (request-to-pay pending).'))
  }

  verifyWebhookSignature(): boolean {
    return false // MoMo callback auth is handled at the tenant-token layer — wired with execution.
  }

  parseWebhook(): ProviderEvent {
    throw new Error('MTN parseWebhook not implemented (request-to-pay pending).')
  }
}
