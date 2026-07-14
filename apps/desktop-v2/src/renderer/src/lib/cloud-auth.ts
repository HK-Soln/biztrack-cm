import type {
  AuthContextInfo,
  AuthFlowResult,
  BillingCycle,
  BusinessOption,
  BusinessSetupPayload,
  InvitePreviewResult,
  OtpChannel,
  PlanList,
  RegisterPayload,
  SessionStatus,
} from '@shared/ipc'
import type { InvitePreviewResponse } from '@biztrack/types'
import {
  cloudHttp,
  cget,
  cpost,
  PUBLIC,
  setAccessToken,
  clearAccessToken,
  getAccessToken,
} from './cloud-http'

/**
 * Cloud (browser) implementation of the DataClient `auth` domain. Mirrors the main
 * process auth.service, but tokens live in-memory here and the session is built by
 * the API (GET /auth/session) rather than a local SQLite cache.
 */

type AuthResponseData = {
  nextStep?: string
  tokens?: { accessToken: string; refreshToken: string }
  context?: {
    maskedPhone?: string
    maskedEmail?: string
    otpExpiresIn?: number
    attemptsLeft?: number
  }
}

export const EMPTY_SESSION: SessionStatus = {
  authenticated: false,
  phase: 'none',
  isOffline: false,
  user: null,
  businessId: null,
  businessName: null,
  businessCurrency: null,
  nextStep: null,
}

function errorText(e: unknown): string {
  const err = e as { response?: { data?: { message?: string } }; message?: string }
  return err?.response?.data?.message ?? err?.message ?? 'Something went wrong. Please try again.'
}

function mapContext(context: AuthResponseData['context']): AuthContextInfo | null {
  if (!context) return null
  return {
    maskedPhone: context.maskedPhone,
    maskedEmail: context.maskedEmail,
    otpExpiresIn: context.otpExpiresIn,
    attemptsLeft: context.attemptsLeft,
  }
}

/**
 * Exchange the httpOnly refresh cookie for a fresh access token (no token in the body —
 * the cookie rides along via withCredentials). Returns true if a token was obtained.
 * Used on bootstrap (hard refresh wipes the in-memory access token).
 */
async function tryCookieRefresh(): Promise<boolean> {
  try {
    const data = await cpost<{ tokens?: { accessToken: string } }>('/auth/refresh', {}, PUBLIC)
    if (data?.tokens?.accessToken) {
      setAccessToken(data.tokens.accessToken)
      return true
    }
    return false
  } catch {
    return false
  }
}

/**
 * Fetch the authoritative SessionStatus from the API. On a hard refresh the in-memory
 * access token is gone, so first try to mint one from the refresh cookie — otherwise a
 * still-valid session would be reported as logged out.
 */
export async function fetchCloudSession(): Promise<SessionStatus> {
  if (!getAccessToken()) {
    const refreshed = await tryCookieRefresh()
    if (!refreshed) return EMPTY_SESSION
  }
  try {
    return await cget<SessionStatus>('/auth/session')
  } catch {
    return EMPTY_SESSION
  }
}

async function ok(data: AuthResponseData): Promise<AuthFlowResult> {
  if (data.tokens?.accessToken) setAccessToken(data.tokens.accessToken)
  const session = data.tokens?.accessToken ? await fetchCloudSession() : EMPTY_SESSION
  return {
    ok: true,
    nextStep: data.nextStep ?? null,
    session,
    context: mapContext(data.context),
    error: null,
  }
}

function fail(e: unknown): AuthFlowResult {
  return { ok: false, nextStep: null, session: EMPTY_SESSION, context: null, error: errorText(e) }
}

async function post(path: string, body: unknown, opts?: typeof PUBLIC): Promise<AuthResponseData> {
  return cpost<AuthResponseData>(path, body, opts)
}

function toBusinessOption(item: unknown): BusinessOption | null {
  if (!item || typeof item !== 'object') return null
  const rec = item as Record<string, unknown>
  const biz = (rec.business as Record<string, unknown> | undefined) ?? rec
  const id = biz.id as string | undefined
  const name = biz.name as string | undefined
  if (!id || !name) return null
  return {
    id,
    name,
    role: (rec.role as string | undefined) ?? null,
    status: (biz.businessStatus as string | undefined) ?? null,
  }
}

export const cloudAuth = {
  getSession: () => fetchCloudSession(),

  login: async (identifier: string, password: string) => {
    try {
      return await ok(await post('/auth/login', { identifier, password }, PUBLIC))
    } catch (e) {
      return fail(e)
    }
  },

  requestLogin: async (identifier: string, channel?: OtpChannel) => {
    try {
      const body: Record<string, unknown> = { identifier }
      if (channel === 'SMS' || channel === 'WHATSAPP') body.preferredOtpChannel = channel
      return await ok(await post('/auth/request-login-otp', body, PUBLIC))
    } catch (e) {
      return fail(e)
    }
  },

  loginOtp: async (identifier: string, code: string) => {
    try {
      return await ok(await post('/auth/login-otp', { identifier, code }, PUBLIC))
    } catch (e) {
      return fail(e)
    }
  },

  requestPasswordReset: async (identifier: string, channel?: OtpChannel) => {
    try {
      const body: Record<string, unknown> = { identifier }
      if (channel === 'SMS' || channel === 'WHATSAPP') body.preferredOtpChannel = channel
      return await ok(await post('/auth/request-password-reset', body, PUBLIC))
    } catch (e) {
      return fail(e)
    }
  },

  resetPassword: async (identifier: string, code: string, newPassword: string) => {
    try {
      return await ok(await post('/auth/reset-password', { identifier, code, newPassword }, PUBLIC))
    } catch (e) {
      return fail(e)
    }
  },

  verifyPhone: async (phone: string, code: string, inviteToken?: string) => {
    try {
      return await ok(
        await post(
          '/auth/verify-phone',
          { phone, code, ...(inviteToken ? { inviteToken } : {}) },
          PUBLIC,
        ),
      )
    } catch (e) {
      return fail(e)
    }
  },

  verifyEmail: async (email: string, code: string, inviteToken?: string) => {
    try {
      return await ok(
        await post(
          '/auth/verify-email',
          { email, code, ...(inviteToken ? { inviteToken } : {}) },
          PUBLIC,
        ),
      )
    } catch (e) {
      return fail(e)
    }
  },

  resendOtp: async (identifier: string, type: string, channel?: OtpChannel) => {
    try {
      const body: Record<string, unknown> = { identifier, type }
      if (channel === 'SMS' || channel === 'WHATSAPP') body.channel = channel
      return await ok(await post('/auth/resend-otp', body, PUBLIC))
    } catch (e) {
      return fail(e)
    }
  },

  register: async (payload: RegisterPayload) => {
    try {
      return await ok(await post('/auth/register', payload, PUBLIC))
    } catch (e) {
      return fail(e)
    }
  },

  getInvitePreview: async (token: string): Promise<InvitePreviewResult> => {
    try {
      const preview = await cget<InvitePreviewResponse>(
        `/invites/${encodeURIComponent(token)}`,
        PUBLIC,
      )
      return { ok: true, preview }
    } catch (e) {
      return { ok: false, error: errorText(e) }
    }
  },

  acceptInvite: async (token: string) => {
    try {
      return await ok(await post(`/invites/${encodeURIComponent(token)}/accept`, {}))
    } catch (e) {
      return fail(e)
    }
  },

  rejectInvite: async (token: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      await cloudHttp.post(`/invites/${encodeURIComponent(token)}/reject`, {})
      return { ok: true }
    } catch (e) {
      return { ok: false, error: errorText(e) }
    }
  },

  setupBusiness: async (payload: BusinessSetupPayload) => {
    try {
      await cloudHttp.post('/businesses/setup', payload)
      // Re-select to get the authoritative nextStep + refreshed session.
      const session = await fetchCloudSession()
      if (!session.businessId) return fail(new Error('No active business to set up.'))
      return await cloudAuth.selectBusiness(session.businessId)
    } catch (e) {
      return fail(e)
    }
  },

  listPlans: async (): Promise<PlanList> => {
    try {
      const data = await cget<{
        plans: Array<{
          name: string
          displayName: string
          priceXAF: number
          priceAnnualXAF: number
          trialDays: number
          quotas?: {
            products?: number | null
            contacts?: number | null
            categories?: number | null
            users?: number | null
          }
          resources?: string[]
          additionalResources?: string[]
          inheritsFrom?: string | null
        }>
        currentPlan: string | null
      }>('/plans')
      return {
        plans: (data.plans ?? []).map((p) => ({
          name: p.name,
          displayName: p.displayName,
          priceXAF: p.priceXAF,
          priceAnnualXAF: p.priceAnnualXAF,
          trialDays: p.trialDays,
          quotas: {
            products: p.quotas?.products ?? null,
            contacts: p.quotas?.contacts ?? null,
            categories: p.quotas?.categories ?? null,
            users: p.quotas?.users ?? null,
          },
          resources: p.resources ?? [],
          additionalResources: p.additionalResources ?? [],
          inheritsFrom: p.inheritsFrom ?? null,
        })),
        currentPlan: data.currentPlan ?? null,
      }
    } catch {
      return { plans: [], currentPlan: null }
    }
  },

  selectPlan: async (plan: string, billingCycle?: BillingCycle) => {
    try {
      const session = await fetchCloudSession()
      if (!session.businessId) return fail(new Error('No active business.'))
      await cloudHttp.post('/plans/select', { plan, billingCycle })
      return await cloudAuth.selectBusiness(session.businessId)
    } catch (e) {
      return fail(e)
    }
  },

  selectBusiness: async (businessId: string) => {
    try {
      return await ok(await post('/auth/select-business', { businessId }))
    } catch (e) {
      return fail(e)
    }
  },

  listBusinesses: async (): Promise<BusinessOption[]> => {
    try {
      const raw = await cget<unknown>('/businesses/mine')
      const items = Array.isArray(raw) ? raw : []
      return items.map((item) => toBusinessOption(item)).filter((o): o is BusinessOption => !!o)
    } catch {
      return []
    }
  },

  offlineLogin: async (): Promise<AuthFlowResult> =>
    fail(new Error('Offline login is not available in the web app.')),

  logout: async (): Promise<SessionStatus> => {
    try {
      await cloudHttp.post('/auth/logout', {})
    } catch {
      /* best-effort; clear locally regardless */
    }
    clearAccessToken()
    return EMPTY_SESSION
  },
}
