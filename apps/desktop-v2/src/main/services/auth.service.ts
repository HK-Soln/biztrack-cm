import bcrypt from 'bcryptjs'
import { HttpError, type HttpClient, type RequestOptions } from '@biztrack/http-client'
import type {
  AuthFlowResult,
  BusinessOption,
  OtpChannel,
  RegisterPayload,
  SessionStatus,
} from '../../shared/ipc'
import { decodeJwt } from './jwt'
import type { LocalCache } from './local-cache'
import type { StoredTokens, TokenStore } from './token-store'

type ApiEnvelope<T> = { success?: boolean; data: T }

interface AuthResponseData {
  nextStep?: string
  tokens?: { accessToken: string; refreshToken: string }
  context?: { maskedPhone?: string; maskedEmail?: string; otpExpiresIn?: number; attemptsLeft?: number }
}

const PUBLIC: RequestOptions = { headers: { 'x-skip-auth': '1', 'x-skip-auth-refresh': '1' } }

const EMPTY: SessionStatus = {
  authenticated: false,
  phase: 'none',
  isOffline: false,
  user: null,
  businessId: null,
  businessName: null,
  nextStep: null,
}

// Maps phase + cached onboarding step to the AuthNextStep that drives routing.
// Mirrors the backend's step resolution so a relaunched session lands on the
// right screen (e.g. a phase2 owner mid-onboarding → setup_business, not dashboard).
function deriveNextStep(phase: 'none' | 'phase1' | 'phase2', onboardingStep: string | null): string | null {
  if (phase === 'none') return null
  if (phase === 'phase1') return 'select_business'
  switch ((onboardingStep ?? '').toUpperCase()) {
    case 'SETUP_BUSINESS':
      return 'setup_business'
    case 'SELECT_PLAN':
      return 'select_plan'
    case 'ADD_FIRST_PRODUCT':
      return 'add_first_product'
    default:
      return 'dashboard'
  }
}

/**
 * Main-process BFF for auth. Owns tokens (via TokenStore), talks to the API, and
 * exposes only derived SessionStatus + flow results to the renderer. Offline login
 * is verified here against the cached bcrypt hash + local SQLite metadata.
 */
export class AuthService {
  private session: SessionStatus = EMPTY
  private readonly deviceId: string

  constructor(
    private readonly http: HttpClient,
    private readonly tokens: TokenStore,
    private readonly cache: LocalCache,
  ) {
    this.deviceId = this.tokens.ensureDeviceId()
    this.hydrate()
  }

  getSession(): SessionStatus {
    return this.session
  }

  /** Called by the http client when a refresh fails — drop the session. */
  onTokensCleared = (): void => {
    this.session = EMPTY
  }

  // ---- flows ---------------------------------------------------------------

  async login(identifier: string, password: string): Promise<AuthFlowResult> {
    try {
      const data = await this.post<AuthResponseData>('/auth/login', { identifier, password }, PUBLIC)
      if (data.tokens) {
        this.tokens.setTokens(data.tokens)
        this.tokens.setPasswordHash(await bcrypt.hash(password, 10))
        this.applyTokens(data.tokens, false, data.nextStep)
      }
      return this.ok(data)
    } catch (e) {
      return this.fail(e)
    }
  }

  async requestLogin(identifier: string, channel?: OtpChannel): Promise<AuthFlowResult> {
    try {
      // Passwordless ("SSO"): use request-login-otp which ALWAYS sends a code,
      // unlike /auth/request-login which returns PASSWORD_REQUIRED for password users.
      const body: Record<string, unknown> = { identifier }
      if (channel === 'SMS' || channel === 'WHATSAPP') body.preferredOtpChannel = channel
      const data = await this.post<AuthResponseData>('/auth/request-login-otp', body, PUBLIC)
      return this.ok(data)
    } catch (e) {
      return this.fail(e)
    }
  }

  async loginOtp(identifier: string, code: string): Promise<AuthFlowResult> {
    try {
      const data = await this.post<AuthResponseData>('/auth/login-otp', { identifier, code }, PUBLIC)
      if (data.tokens) {
        this.tokens.setTokens(data.tokens)
        this.applyTokens(data.tokens, false, data.nextStep)
      }
      return this.ok(data)
    } catch (e) {
      return this.fail(e)
    }
  }

  async verifyPhone(phone: string, code: string): Promise<AuthFlowResult> {
    return this.verify('/auth/verify-phone', { phone, code })
  }

  async verifyEmail(email: string, code: string): Promise<AuthFlowResult> {
    return this.verify('/auth/verify-email', { email, code })
  }

  private async verify(path: string, body: Record<string, unknown>): Promise<AuthFlowResult> {
    try {
      const data = await this.post<AuthResponseData>(path, body, PUBLIC)
      if (data.tokens) {
        this.tokens.setTokens(data.tokens)
        this.applyTokens(data.tokens, false, data.nextStep)
      }
      return this.ok(data)
    } catch (e) {
      return this.fail(e)
    }
  }

  async resendOtp(identifier: string, type: string, channel?: OtpChannel): Promise<AuthFlowResult> {
    try {
      const body: Record<string, unknown> = { identifier, type }
      if (channel === 'SMS' || channel === 'WHATSAPP') body.channel = channel
      const data = await this.post<AuthResponseData>('/auth/resend-otp', body, PUBLIC)
      return this.ok(data)
    } catch (e) {
      return this.fail(e)
    }
  }

  async register(payload: RegisterPayload): Promise<AuthFlowResult> {
    try {
      const data = await this.post<AuthResponseData>('/auth/register', payload, PUBLIC)
      // Cache the password hash now so offline login works after first verify.
      this.tokens.setPasswordHash(await bcrypt.hash(payload.password, 10))
      return this.ok(data)
    } catch (e) {
      return this.fail(e)
    }
  }

  async selectBusiness(businessId: string): Promise<AuthFlowResult> {
    try {
      const data = await this.post<AuthResponseData>('/auth/select-business', { businessId })
      if (data.tokens) {
        this.tokens.setTokens(data.tokens)
        this.applyTokens(data.tokens, false, data.nextStep)
        await this.cacheProfileAndBusinesses()
        // Re-apply so the cached business name shows — but keep the API's authoritative
        // nextStep (business-status-driven), not a re-derivation from onboardingStep.
        const stored = this.tokens.getTokens()
        if (stored) this.applyTokens(stored, false, data.nextStep)
        void this.ensureSyncToken()
      }
      return this.ok(data)
    } catch (e) {
      return this.fail(e)
    }
  }

  async listBusinesses(): Promise<BusinessOption[]> {
    try {
      const raw = await this.get<unknown>('/businesses/mine')
      const items = Array.isArray(raw) ? raw : []
      const options = items.map((item) => this.toBusinessOption(item)).filter((o): o is BusinessOption => !!o)
      const userId = this.session.user?.id ?? this.tokens.getLastUserId()
      if (userId) this.cache.saveBusinesses(userId, options)
      return options
    } catch {
      const userId = this.tokens.getLastUserId()
      return userId ? this.cache.listBusinesses(userId) : []
    }
  }

  async offlineLogin(password: string): Promise<AuthFlowResult> {
    const hash = this.tokens.getPasswordHash()
    if (!hash) return this.fail(new Error('No offline credentials saved on this device.'))
    const matches = await bcrypt.compare(password, hash)
    if (!matches) return this.fail(new Error('Incorrect password.'))

    const userId = this.tokens.getLastUserId()
    const businessId = this.tokens.getLastBusinessId()
    const cu = userId ? this.cache.getUser(userId) : null
    const cb = businessId ? this.cache.getBusiness(businessId) : null
    const phase = businessId ? 'phase2' : 'phase1'
    // Prefer the last authoritative step from the API; derive only if none is stored.
    const nextStep = this.tokens.getLastNextStep() || deriveNextStep(phase, cu?.onboardingStep ?? null)
    this.session = {
      authenticated: !!businessId,
      phase,
      isOffline: true,
      user: cu ? { id: cu.id, name: cu.name ?? '', email: cu.email, phone: cu.phone, role: cu.role } : null,
      businessId,
      businessName: cb?.name ?? null,
      nextStep,
    }
    return { ok: true, nextStep, session: this.session, context: null, error: null }
  }

  async logout(): Promise<SessionStatus> {
    try {
      await this.post('/auth/logout', {})
    } catch {
      // Best-effort; clear locally regardless.
    }
    this.tokens.clearTokens()
    this.session = EMPTY
    return this.session
  }

  // ---- internals -----------------------------------------------------------

  private hydrate(): void {
    const stored = this.tokens.getTokens()
    // Restore the last authoritative nextStep so a relaunch lands where the backend
    // last said, instead of re-deriving (which can disagree for owners mid-setup).
    if (stored) this.applyTokens(stored, false, this.tokens.getLastNextStep())
  }

  /**
   * Rebuilds the session from a token pair. `nextStep` is AUTHORITATIVE: when the
   * API just told us the next step (authoritativeNextStep), we use it verbatim — the
   * backend decides routing (e.g. select-business uses business status, not the
   * user's onboardingStep). We only fall back to a local derivation on cold start /
   * offline, where no fresh API answer exists. The authoritative value is persisted
   * so the next cold start restores it instead of re-guessing.
   */
  private applyTokens(tokens: StoredTokens, offline: boolean, authoritativeNextStep?: string | null): void {
    const payload = decodeJwt(tokens.accessToken)
    if (!payload?.sub) {
      this.session = EMPTY
      return
    }
    const phase = payload.type === 'phase2' ? 'phase2' : 'phase1'
    const businessId = payload.businessId ?? null
    const cu = this.cache.getUser(payload.sub)
    const cb = businessId ? this.cache.getBusiness(businessId) : null
    const nextStep = authoritativeNextStep || deriveNextStep(phase, cu?.onboardingStep ?? null)
    this.session = {
      authenticated: phase === 'phase2' && !!businessId,
      phase,
      isOffline: offline,
      user: {
        id: payload.sub,
        name: cu?.name ?? '',
        email: payload.email ?? cu?.email ?? null,
        phone: payload.phone ?? cu?.phone ?? null,
        role: (payload.role as string | null) ?? cu?.role ?? null,
      },
      businessId,
      businessName: cb?.name ?? null,
      nextStep,
    }
    this.tokens.setLastSession(payload.sub, businessId)
    if (authoritativeNextStep) this.tokens.setLastNextStep(authoritativeNextStep)
  }

  private async cacheProfileAndBusinesses(): Promise<void> {
    try {
      const me = await this.get<{
        id: string
        name?: string
        email?: string
        phone?: string
        language?: string
        onboardingStep?: string
      }>('/users/me')
      if (me?.id) {
        this.cache.saveUser({
          id: me.id,
          name: me.name ?? null,
          email: me.email ?? null,
          phone: me.phone ?? null,
          role: this.session.user?.role ?? null,
          businessId: this.session.businessId,
          onboardingStep: me.onboardingStep ?? null,
          language: me.language ?? null,
        })
      }
    } catch {
      // non-fatal
    }
    await this.listBusinesses()
  }

  private async ensureSyncToken(): Promise<void> {
    try {
      const data = await this.post<{ syncToken?: string }>('/sync/token', { deviceId: this.deviceId })
      if (data.syncToken) this.tokens.setSyncCredential(data.syncToken)
    } catch {
      // Sync token is best-effort here; the sync engine milestone will own retries.
    }
  }

  private toBusinessOption(item: unknown): BusinessOption | null {
    if (!item || typeof item !== 'object') return null
    const rec = item as Record<string, unknown>
    const biz = (rec.business as Record<string, unknown> | undefined) ?? rec
    const id = biz.id as string | undefined
    const name = biz.name as string | undefined
    if (!id || !name) return null
    return { id, name, role: (rec.role as string | undefined) ?? null }
  }

  private async post<T>(path: string, body: unknown, opts?: RequestOptions): Promise<T> {
    const res = await this.http.post<ApiEnvelope<T>>(path, body, opts)
    return res.data.data
  }

  private async get<T>(path: string, opts?: RequestOptions): Promise<T> {
    const res = await this.http.get<ApiEnvelope<T>>(path, opts)
    return res.data.data
  }

  private ok(data: AuthResponseData): AuthFlowResult {
    return {
      ok: true,
      nextStep: data.nextStep ?? null,
      session: this.session,
      context: data.context
        ? {
            maskedPhone: data.context.maskedPhone,
            maskedEmail: data.context.maskedEmail,
            otpExpiresIn: data.context.otpExpiresIn,
            attemptsLeft: data.context.attemptsLeft,
          }
        : null,
      error: null,
    }
  }

  private fail(e: unknown): AuthFlowResult {
    let message = 'Something went wrong. Please try again.'
    if (e instanceof HttpError) {
      message = (e.response?.data as { message?: string } | undefined)?.message ?? e.message
    } else if (e instanceof Error) {
      message = e.message
    }
    return { ok: false, nextStep: null, session: this.session, context: null, error: message }
  }
}
