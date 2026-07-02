import type { IsoDateString } from './http.types'

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
}

export interface UpdateBusinessRequest extends Partial<CreateBusinessRequest> {}

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
  currency: Currency | string
  logoUrl: string | null
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
  description?:string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  currency?: Currency | string
  logoUrl?: string | null
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
