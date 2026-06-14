// Single source of truth for the renderer↔main IPC contract. Imported by main
// (handlers), preload (bridge), and renderer (typed window.api). NO data or token
// channels are exposed beyond these typed, high-level domain calls.

export const IPC = {
  skeletonCheck: 'skeleton:check',
  skeletonHealth: 'skeleton:health',
  themeSet: 'theme:set',
  titlebarSetOverlay: 'titlebar:set-overlay',
  authGetSession: 'auth:get-session',
  authLogin: 'auth:login',
  authRequestLogin: 'auth:request-login',
  authLoginOtp: 'auth:login-otp',
  authVerifyPhone: 'auth:verify-phone',
  authVerifyEmail: 'auth:verify-email',
  authResendOtp: 'auth:resend-otp',
  authRegister: 'auth:register',
  authSelectBusiness: 'auth:select-business',
  authListBusinesses: 'auth:list-businesses',
  authOfflineLogin: 'auth:offline-login',
  authLogout: 'auth:logout',
} as const

// ---- Auth (Feature 1) -----------------------------------------------------
// The renderer only ever sees SESSION STATUS — never tokens. Tokens live in the
// Electron main process (secure-store). Cloud build will swap the same shape.
export type AuthPhase = 'none' | 'phase1' | 'phase2'

export interface SessionUser {
  id: string
  name: string
  email: string | null
  phone: string | null
  role: string | null
}

export interface SessionStatus {
  /** True only when a phase2 (business-scoped) session is active. NOTE: this is NOT
   * the same as "ready for dashboard" — a phase2 user may still be mid-onboarding.
   * Routing must use `nextStep`. */
  authenticated: boolean
  phase: AuthPhase
  isOffline: boolean
  user: SessionUser | null
  businessId: string | null
  businessName: string | null
  /** The AuthNextStep that drives routing: which screen this session should be on
   * (e.g. 'select_business', 'setup_business', 'dashboard'). null = signed out. */
  nextStep: string | null
}

export interface AuthContextInfo {
  maskedPhone?: string
  maskedEmail?: string
  otpExpiresIn?: number
  attemptsLeft?: number
}

/** Result of an auth-flow step: what to do next + the refreshed session. */
export interface AuthFlowResult {
  ok: boolean
  nextStep: string | null
  session: SessionStatus
  context: AuthContextInfo | null
  error: string | null
}

export interface BusinessOption {
  id: string
  name: string
  role: string | null
  /** Business lifecycle: 'ONBOARDING' | 'PLAN_PENDING' | 'ACTIVE' (or null if unknown).
   * A non-owner can only enter an ACTIVE business. */
  status: string | null
}

export type OtpChannel = 'SMS' | 'WHATSAPP' | 'EMAIL'

export interface RegisterPayload {
  name: string
  phone: string
  email?: string
  password: string
  businessName?: string
  language?: string
  preferredPhoneChannel?: 'SMS' | 'WHATSAPP'
  inviteToken?: string
}

export interface TitleBarOverlayColors {
  /** Background of the native caption-button band (hex). */
  color: string
  /** Symbol (− □ ×) colour (hex). */
  symbolColor: string
}

export interface SkeletonCheckDTO {
  value: string
  checkedAt: string
}

export interface SkeletonHealthDTO {
  ok: boolean
  productCount: number
  skeletonValue: string | null
  source: 'local-sqlite'
}

/** The shape exposed on `window.api` by the preload bridge. */
export interface BridgeApi {
  skeleton: {
    getCheck: () => Promise<SkeletonCheckDTO | null>
    getHealth: () => Promise<SkeletonHealthDTO>
  }
  theme: {
    set: (theme: 'light' | 'dark' | 'system') => void
  }
  window: {
    /** Paint the native window controls to match the current top bar. */
    setTitleBarOverlay: (colors: TitleBarOverlayColors) => void
  }
  auth: {
    getSession: () => Promise<SessionStatus>
    login: (identifier: string, password: string) => Promise<AuthFlowResult>
    requestLogin: (identifier: string, channel?: OtpChannel) => Promise<AuthFlowResult>
    loginOtp: (identifier: string, code: string) => Promise<AuthFlowResult>
    verifyPhone: (phone: string, code: string) => Promise<AuthFlowResult>
    verifyEmail: (email: string, code: string) => Promise<AuthFlowResult>
    resendOtp: (identifier: string, type: string, channel?: OtpChannel) => Promise<AuthFlowResult>
    register: (payload: RegisterPayload) => Promise<AuthFlowResult>
    selectBusiness: (businessId: string) => Promise<AuthFlowResult>
    listBusinesses: () => Promise<BusinessOption[]>
    offlineLogin: (password: string) => Promise<AuthFlowResult>
    logout: () => Promise<SessionStatus>
  }
}
