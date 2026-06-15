import type { AuthNextStep } from './auth.types'
import type { SubscriptionPlan, SubscriptionStatus, BillingCycle } from './business.types'
import type { IsoDateString } from './http.types'
import type { AuthPermissions, PlanQuotaMap, PlanQuotaUsage } from './permissions.types'

export interface PlanResourceSummary {
  name: SubscriptionPlan
  displayName: string
  /** Monthly price in XAF. */
  priceXAF: number
  /** Annual price in XAF (typically 10× monthly — two months free). */
  priceAnnualXAF: number
  trialDays: number
  resources: string[]
  quotas: PlanQuotaMap
  inheritsFrom: SubscriptionPlan | null
  additionalResources: string[]
}

export interface ListPlansResponse {
  plans: PlanResourceSummary[]
  currentPlan: SubscriptionPlan | null
}

export interface SelectPlanRequest {
  plan: SubscriptionPlan
  billingCycle?: BillingCycle
}

export interface SelectPlanResponse {
  nextStep: AuthNextStep
  message: string
  authPermissions: AuthPermissions
  subscription: {
    status: SubscriptionStatus
    trialEndsAt: IsoDateString | null
    trialDaysRemaining: number
  }
}

export interface CurrentSubscriptionResponse {
  plan: SubscriptionPlan
  status: SubscriptionStatus
  trialEndsAt: IsoDateString | null
  trialDaysRemaining: number
  currentPeriodEnd: IsoDateString | null
  cancelAtPeriodEnd: boolean
  paymentConfigured: boolean
}

export interface UpgradePlanRequest {
  plan: SubscriptionPlan
}

export interface UpgradePlanResponse {
  authPermissions: AuthPermissions
}

export interface CancelPlanResponse {
  cancelAtPeriodEnd: boolean
  currentPeriodEnd: IsoDateString | null
}

export interface PlanStateResponse {
  selectedPlan: SubscriptionPlan
  effectivePlan: SubscriptionPlan
  status: SubscriptionStatus
  trialStartedAt: IsoDateString | null
  trialEndsAt: IsoDateString | null
  currentPeriodStart: IsoDateString | null
  currentPeriodEnd: IsoDateString | null
  cancelAtPeriodEnd: boolean
  entitlementValid: boolean
  entitlementExpiresAt: IsoDateString | null
  fetchedAt: IsoDateString
  staleAfter: IsoDateString
  authPermissions: AuthPermissions
  quotas: PlanQuotaMap
  quotaUsage: PlanQuotaUsage[]
}

export interface QuotaUsageResponse {
  selectedPlan: SubscriptionPlan
  effectivePlan: SubscriptionPlan
  entitlementValid: boolean
  fetchedAt: IsoDateString
  quotaUsage: PlanQuotaUsage[]
}
