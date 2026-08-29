import type { IsoDateString } from './http.types'
import type { MemberAuthCredentialType } from './credential.types'

export interface Business {
  id: string
  name: string
  slug: string
  description?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  city?: string | null
  country: string
  type: BusinessType
  currency: Currency | string
  logoUrl?: string | null
  businessHours?: BusinessHours | null
  /** Days of credit granted by default when a sale is put on account (drives due dates). */
  defaultCreditDays?: number | null
  /** Canonical business timezone (IANA, e.g. Africa/Douala) — the single source of truth for
   * business_date, digest timing and quiet hours (BIZ-5.1). */
  timezone?: string | null
  /** Local time of day the trading day rolls over ('HH:mm', default 00:00). */
  dayCutoverTime?: string | null
  /** Month (1–12) the fiscal year begins in; default 1 = January (OHADA) (BIZ-5.2). */
  fiscalYearStartMonth?: number | null
  /** Business size profile (MICRO | SMALL | SME) — sets defaults + drives vocabulary (BIZ-5.7). */
  profile?: BusinessProfileTier | null
  /** Authorization methods accepted at step-up (BIZ-3.3). null/absent ⇒ both PIN + CARD. */
  allowedAuthMethods?: MemberAuthCredentialType[] | null
  ownerId: string
  plan: SubscriptionPlan
  subscriptionStatus: SubscriptionStatus
  billingCycle?: BillingCycle
  businessStatus: BusinessStatus
  trialStartedAt?: IsoDateString | null
  trialEndsAt?: IsoDateString | null
  currentPeriodStart?: IsoDateString | null
  currentPeriodEnd?: IsoDateString | null
  cancelAtPeriodEnd: boolean
  niu?: string | null
  rccm?: string | null
  vatRegistered?: boolean
  defaultVatRate?: number | null
  fiscalRegime?: FiscalRegime | null
  createdAt: IsoDateString
  updatedAt: IsoDateString
}

export enum Currency {
  XAF = 'XAF',
  USD = 'USD',
  EUR = 'EUR',
}

export enum BusinessType {
  EPICERIE = 'EPICERIE',
  BOUTIQUE = 'BOUTIQUE',
  RESTAURANT = 'RESTAURANT',
  PHARMACIE = 'PHARMACIE',
  SALON = 'SALON',
  ELECTRONIQUE = 'ELECTRONIQUE',
  AUTRE = 'AUTRE',
}

export enum SubscriptionPlan {
  FREE = 'FREE',
  SOLO = 'SOLO',
  BUSINESS = 'BUSINESS',
  PRO = 'PRO',
}

export enum SubscriptionStatus {
  TRIAL = 'TRIAL',
  ACTIVE = 'ACTIVE',
  PAST_DUE = 'PAST_DUE',
  CANCELLED = 'CANCELLED',
  SUSPENDED = 'SUSPENDED',
}

export enum BillingCycle {
  MONTHLY = 'MONTHLY',
  ANNUAL = 'ANNUAL',
}

export enum BusinessMemberRole {
  OWNER = 'OWNER',
  MANAGER = 'MANAGER',
  CASHIER = 'CASHIER',
  ACCOUNTANT = 'ACCOUNTANT',
  /** Generic placeholder for custom (non-system) roles */
  STAFF = 'STAFF',
}

export enum BusinessMemberStatus {
  ACTIVE = 'ACTIVE',
  PENDING = 'PENDING',
  /** Access revoked but the member is kept (can be reactivated). Denied at sign-in,
   * select-business and token refresh. */
  SUSPENDED = 'SUSPENDED',
  REMOVED = 'REMOVED',
}

export enum BusinessStatus {
  ONBOARDING = 'ONBOARDING',
  PLAN_PENDING = 'PLAN_PENDING',
  ACTIVE = 'ACTIVE',
}

/** OHADA / Cameroon tax regime. Captured during setup; tax behaviour driven by it
 * is part of the (deferred) OHADA accounting feature — stored, not yet applied. */
export enum FiscalRegime {
  IMPOT_LIBERATOIRE = 'IMPOT_LIBERATOIRE',
  SIMPLIFIE = 'SIMPLIFIE',
  REEL = 'REEL',
}

/**
 * BIZ-5.7 — business size profile. Sets sensible defaults and, above all, drives profile-aware
 * VOCABULARY: the same operation reads "Clôture du jour" to a MICRO boutique and "Clôture de
 * période" to an SME/accountant. A MICRO owner must never meet accounting jargon like "période".
 * Every module stays independently switchable — the profile only picks defaults. Capped at SME
 * (multi-entity/corporate is a different product).
 */
export enum BusinessProfileTier {
  MICRO = 'MICRO',
  SMALL = 'SMALL',
  SME = 'SME',
}

/** Fiscal/legal identifiers + tax settings. Persisted on the business; NOT consumed
 * by any tax computation yet (see deferred OHADA feature plan). */
export interface BusinessFiscalFields {
  /** Numéro d'Identifiant Unique (taxpayer number). */
  niu?: string | null
  /** Registre du Commerce et du Crédit Mobilier. */
  rccm?: string | null
  /** Assujetti à la TVA. */
  vatRegistered?: boolean
  /** Default VAT/TVA rate, e.g. 19.25. */
  defaultVatRate?: number | null
  fiscalRegime?: FiscalRegime | null
}

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

/** Weekdays in display/order (Mon-first). */
export const WEEKDAYS: readonly Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

/** A single day's opening/closing time, local 'HH:mm' (24h). */
export interface DayHours {
  open: string
  close: string
}

/** Per-weekday business hours — a null day means the business is closed that day.
 * Evaluated in the business timezone. Drives the daily-digest send time. */
export type BusinessHours = Record<Weekday, DayHours | null>

const BUSINESS_HOURS_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

/** Validate + normalize arbitrary input into a clean BusinessHours (or null when no
 * valid day is present). Only known weekdays with valid HH:mm open/close survive; any
 * other day becomes null (closed). Shared by the API (persist) and the UI. */
export function normalizeBusinessHours(input: unknown): BusinessHours | null {
  if (!input || typeof input !== 'object') return null
  const src = input as Record<string, unknown>
  const out = {} as BusinessHours
  let hasOpenDay = false
  for (const day of WEEKDAYS) {
    const v = src[day]
    if (v && typeof v === 'object') {
      const open = (v as Record<string, unknown>).open
      const close = (v as Record<string, unknown>).close
      if (
        typeof open === 'string' &&
        typeof close === 'string' &&
        BUSINESS_HOURS_HHMM.test(open) &&
        BUSINESS_HOURS_HHMM.test(close)
      ) {
        out[day] = { open, close }
        hasOpenDay = true
        continue
      }
    }
    out[day] = null
  }
  return hasOpenDay ? out : null
}

/** Default credit period (days) for on-account sales when a debt carries no explicit due
 * date. Drives the effective due date used by ageing + debt-due reminders (D9). */
export const DEFAULT_CREDIT_DAYS = 30
export const MAX_CREDIT_DAYS = 365

/** Clamp a requested credit period to a valid integer in [0, MAX]. */
export function clampCreditDays(days: number | null | undefined): number {
  if (days == null || !Number.isFinite(days)) return DEFAULT_CREDIT_DAYS
  return Math.min(MAX_CREDIT_DAYS, Math.max(0, Math.round(days)))
}

/** Default business profile — the neutral middle. MICRO opts into simplified wording, SME into
 * full accounting vocabulary. */
export const DEFAULT_BUSINESS_PROFILE = BusinessProfileTier.SMALL

/** Coerce an arbitrary value to a valid BusinessProfileTier, falling back to the default. */
export function normalizeBusinessProfile(value: unknown): BusinessProfileTier {
  return value === BusinessProfileTier.MICRO ||
    value === BusinessProfileTier.SMALL ||
    value === BusinessProfileTier.SME
    ? value
    : DEFAULT_BUSINESS_PROFILE
}

export interface CreateBusinessRequest extends BusinessFiscalFields {
  name: string
  description?: string
  phone?: string
  email?: string
  address?: string
  city?: string
  country?: string
  currency?: Currency | string
  type?: BusinessType
  /** Logo shown on receipts and the storefront. Persisted on the business. */
  logoUrl?: string | null
  /** Per-weekday opening hours (null day = closed). */
  businessHours?: BusinessHours | null
  /** Default credit period in days for on-account sales (0–365). */
  defaultCreditDays?: number | null
  /** Canonical business timezone (IANA); default Africa/Douala. */
  timezone?: string | null
  /** Local trading-day cutover ('HH:mm'); default 00:00. */
  dayCutoverTime?: string | null
  /** Month (1–12) the fiscal year begins in; default 1 (January). */
  fiscalYearStartMonth?: number | null
  /** Business size profile (MICRO | SMALL | SME) — sets defaults + drives vocabulary. */
  profile?: BusinessProfileTier | null
  /** Authorization methods accepted at step-up (BIZ-3.3). null/absent ⇒ both PIN + CARD. */
  allowedAuthMethods?: MemberAuthCredentialType[] | null
}

export type UpdateBusinessRequest = Partial<CreateBusinessRequest>

/** Editable business-profile view used by the desktop Settings → Business profile
 * section. Read from GET /businesses/mine (the membership's business summary) and
 * written via POST /businesses/setup. `role` is the current user's membership role,
 * used to gate editing to the OWNER. */
export interface BusinessProfile {
  id: string
  name: string
  type: BusinessType | null
  description: string | null
  phone: string | null
  email: string | null
  address: string | null
  city: string | null
  country: string | null
  currency: Currency | string
  logoUrl: string | null
  businessHours: BusinessHours | null
  defaultCreditDays: number | null
  timezone: string | null
  dayCutoverTime: string | null
  fiscalYearStartMonth: number | null
  profile: BusinessProfileTier | null
  allowedAuthMethods: MemberAuthCredentialType[] | null
  // Legal / fiscal identity captured at onboarding (editable afterward — Settings → Tax).
  niu: string | null
  rccm: string | null
  vatRegistered: boolean
  defaultVatRate: number | null
  fiscalRegime: FiscalRegime | null
  role: BusinessMemberRole | null
}

export interface BusinessMembershipBusinessSummary {
  id: string
  name: string
  slug: string
  city?: string | null
  type?: BusinessType | null
  plan?: SubscriptionPlan | null
  businessStatus?: BusinessStatus | null
  description?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  country?: string | null
  currency?: Currency | string
  logoUrl?: string | null
  businessHours?: BusinessHours | null
  defaultCreditDays?: number | null
  timezone?: string | null
  dayCutoverTime?: string | null
  fiscalYearStartMonth?: number | null
  profile?: BusinessProfileTier | null
  allowedAuthMethods?: MemberAuthCredentialType[] | null
  niu?: string | null
  rccm?: string | null
  vatRegistered?: boolean
  defaultVatRate?: number | null
  fiscalRegime?: FiscalRegime | null
  ownerId?: string | null
  owner?: string | null
  subscriptionStatus?: SubscriptionStatus | null
  trialStartedAt?: IsoDateString | null
  trialEndsAt?: IsoDateString | null
  currentPeriodStart?: IsoDateString | null
  currentPeriodEnd?: IsoDateString | null
  cancelAtPeriodEnd?: boolean | null
}

export interface BusinessMembershipSummary {
  businessId: string
  role: BusinessMemberRole
  status: BusinessMemberStatus
  business: BusinessMembershipBusinessSummary | null
}

export interface TeamMember {
  memberId: string
  userId: string
  roleId: string
  roleName: string
  role: BusinessMemberRole | null
  status: BusinessMemberStatus
  name: string | null
  email: string | null
  phone: string | null
  joinedAt: IsoDateString
}

export interface ListTeamMembersResponse {
  members: TeamMember[]
}

export interface RemoveTeamMemberResponse {
  removed: boolean
}

export interface UpdateMemberStatusRequest {
  /** true → reactivate (ACTIVE); false → deactivate/suspend (SUSPENDED). */
  active: boolean
}

export interface UpdateMemberStatusResponse {
  memberId: string
  status: BusinessMemberStatus
}

/** Set/rotate the caller's own offline manager PIN (BIZ-3.1). The PIN is hashed
 * on-device with bcrypt; only the hash is sent — the server never sees the PIN. */
export interface SetMemberPinRequest {
  /** A bcrypt hash of the PIN, produced on the device. */
  pinHash: string
}

export interface SetMemberPinResponse {
  memberId: string
  pinVersion: number
  pinSetAt: string
}

// --- Invitee side: an existing user's pending business invitations (accept/reject) ---
export interface PendingInvitationItem {
  businessId: string
  businessName: string
  /** Role display name the invitee would join as (null if unset). */
  role: string | null
  invitedAt: string
}

export interface ListMyInvitationsResponse {
  items: PendingInvitationItem[]
}

export interface AcceptInvitationResponse {
  businessId: string
  accepted: true
}

export interface RejectInvitationResponse {
  businessId: string
  rejected: true
}

export interface UpdateMemberRoleRequest {
  roleId: string
}

export interface UpdateMemberRoleResponse {
  memberId: string
  roleId: string
  roleName: string
  role: BusinessMemberRole | null
}

export interface BulkUpdateMemberRoleRequest {
  userIds: string[]
  roleId: string
}

export interface BulkUpdateMemberRoleResponse {
  updated: number
}

export type InviteStatus = 'pending' | 'expired'

export interface PendingInviteItem {
  id: string
  roleId: string
  roleName: string
  role: BusinessMemberRole | null
  phone: string | null
  email: string | null
  status: InviteStatus
  expiresAt: IsoDateString
  createdAt: IsoDateString
}

export interface ListPendingInvitesResponse {
  invites: PendingInviteItem[]
}

export interface ResendInviteResponse {
  resent: boolean
  inviteUrl: string | null
}

export interface CancelInviteResponse {
  cancelled: boolean
}
