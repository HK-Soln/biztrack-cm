import { SubscriptionPlan, BusinessMemberRole } from './business.types'
import type { AuthPermissions } from './permissions.types'

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
  SELECT_BUSINESS = 'select_business',
  SELECT_PLAN = 'select_plan',
  SETUP_BUSINESS = 'setup_business',
  ADD_FIRST_PRODUCT = 'add_first_product',
  DASHBOARD = 'dashboard',
  REGISTER = 'register',
  LOGIN = 'login',
  REQUEST_NEW_OTP = 'request_new_otp',
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

export interface AuthNextStepSelectBusinessResponse {
  nextStep: AuthNextStep.SELECT_BUSINESS
  tokens: AuthTokens
}

export interface AuthNextStepOnboardingResponse {
  nextStep:
    | AuthNextStep.SELECT_PLAN
    | AuthNextStep.SETUP_BUSINESS
    | AuthNextStep.ADD_FIRST_PRODUCT
    | AuthNextStep.DASHBOARD
  tokens: AuthTokens
  authPermissions?: AuthPermissions
}

export interface AuthNextStepRequestNewOtpResponse {
  nextStep: AuthNextStep.REQUEST_NEW_OTP
  context?: AuthContext
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
  | AuthNextStepSelectBusinessResponse
  | AuthNextStepOnboardingResponse
  | AuthNextStepRequestNewOtpResponse

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

export interface AuthContext {
  maskedPhone?: string
  maskedEmail?: string
  otpChannel?: VerificationChannel
  otpExpiresIn?: number
  attemptsLeft?: number
  lockUntil?: number
  requiresPlan?: SubscriptionPlan
}

export interface JwtPayload {
  sub: string
  email?: string | null
  phone?: string | null
  role?: BusinessMemberRole | null
  businessId?: string | null
  type?: 'phase1' | 'phase2'
}
