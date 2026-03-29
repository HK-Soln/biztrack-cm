export enum UserRole {
  OWNER = 'OWNER',
  MANAGER = 'MANAGER',
  CASHIER = 'CASHIER',
  ADMIN = 'ADMIN',
}

export enum VerificationChannel {
  PHONE = 'PHONE',
  EMAIL = 'EMAIL',
}

export enum AuthNextStep {
  VERIFY_PHONE = 'verify_phone',
  VERIFY_EMAIL = 'verify_email',
  PASSWORD_REQUIRED = 'password_required',
  CONFIRM_LOGIN = 'confirm_login',
  LOGIN_COMPLETE = 'login_complete',
}

export enum PrefferedPhoneChannel {
  SMS = 'SMS',
  WHATSAPP = 'WHATSAPP',
}

export interface AuthVerification {
  channel: VerificationChannel
  delivery?: PrefferedPhoneChannel
  expiresAt: Date
  code?: string
}

export interface AuthNextStepVerifyPhoneResponse {
  nextStep: AuthNextStep.VERIFY_PHONE
  verification: AuthVerification
}

export interface AuthNextStepVerifyEmailResponse {
  nextStep: AuthNextStep.VERIFY_EMAIL
  verification: AuthVerification
}

export interface AuthNextStepPasswordRequiredResponse {
  nextStep: AuthNextStep.PASSWORD_REQUIRED
}

export interface AuthNextStepLoginCompleteResponse {
  nextStep: AuthNextStep.LOGIN_COMPLETE
  displayName: string
  tokens: AuthTokens
}

export interface AuthNextStepConfirmLoginResponse {
  nextStep: AuthNextStep.CONFIRM_LOGIN
  verification: AuthVerification
}

export type AuthNextStepResponse =
  | AuthNextStepVerifyPhoneResponse
  | AuthNextStepVerifyEmailResponse
  | AuthNextStepPasswordRequiredResponse
  | AuthNextStepConfirmLoginResponse
  | AuthNextStepLoginCompleteResponse

export interface User {
  id: string
  email?: string | null
  phone?: string | null
  name: string
  avatarUrl?: string | null
  role: UserRole
  language: string
  isEmailVerified: boolean
  isPhoneVerified: boolean
  isActive: boolean
  preferredPhoneChannel?: PrefferedPhoneChannel
  businessId?: string | null
  createdAt: Date
  updatedAt: Date
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

export interface JwtPayload {
  sub: string
  email?: string | null
  phone?: string | null
  role: UserRole
  businessId?: string
}
