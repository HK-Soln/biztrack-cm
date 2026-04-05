export interface Business {
  id: string
  name: string
  slug: string
  description?: string
  phone?: string
  email?: string
  address?: string
  city?: string
  country: string
  currency: Currency
  logoUrl?: string
  ownerId: string
  subscriptionPlan: SubscriptionPlan
  subscriptionStatus: SubscriptionStatus
  subscriptionExpiresAt?: Date
  createdAt: Date
  updatedAt: Date
}

export enum Currency {
  XAF = 'XAF',
  USD = 'USD',
  EUR = 'EUR',
}

export enum SubscriptionPlan {
  FREE = 'FREE',
  SOLO = 'SOLO',
  BUSINESS = 'BUSINESS',
  PRO = 'PRO',
}

export enum SubscriptionStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  TRIAL = 'TRIAL',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

export enum BusinessMemberRole {
  OWNER = 'OWNER',
  MANAGER = 'MANAGER',
  CASHIER = 'CASHIER',
  ACCOUNTANT = 'ACCOUNTANT',
}

export enum BusinessMemberStatus {
  ACTIVE = 'ACTIVE',
  PENDING = 'PENDING',
  REMOVED = 'REMOVED',
}

export enum BusinessStatus {
  ONBOARDING = 'ONBOARDING',
  PLAN_PENDING = 'PLAN_PENDING',
  ACTIVE = 'ACTIVE',
}

export const SUBSCRIPTION_LIMITS: Record<SubscriptionPlan, {
  maxProducts: number
  maxUsers: number
  maxDevices: number
  thermalPrinting: boolean
  advancedReports: boolean
  multiDevice: boolean
  multiBranch: boolean
  apiAccess: boolean
}> = {
  [SubscriptionPlan.FREE]: {
    maxProducts: 50,
    maxUsers: 1,
    maxDevices: 1,
    thermalPrinting: false,
    advancedReports: false,
    multiDevice: false,
    multiBranch: false,
    apiAccess: false,
  },
  [SubscriptionPlan.SOLO]: {
    maxProducts: Infinity,
    maxUsers: 1,
    maxDevices: 1,
    thermalPrinting: false,
    advancedReports: true,
    multiDevice: false,
    multiBranch: false,
    apiAccess: false,
  },
  [SubscriptionPlan.BUSINESS]: {
    maxProducts: Infinity,
    maxUsers: 3,
    maxDevices: 3,
    thermalPrinting: true,
    advancedReports: true,
    multiDevice: true,
    multiBranch: false,
    apiAccess: false,
  },
  [SubscriptionPlan.PRO]: {
    maxProducts: Infinity,
    maxUsers: Infinity,
    maxDevices: Infinity,
    thermalPrinting: true,
    advancedReports: true,
    multiDevice: true,
    multiBranch: true,
    apiAccess: true,
  },
}
