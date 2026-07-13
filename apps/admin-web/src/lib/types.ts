export interface PermissionScope {
  city?: string
  plan?: string
}

export interface AdminProfile {
  id: string
  name: string
  email: string
  isSuperAdmin: boolean
  isActive: boolean
  mustChangePassword: boolean
  role: { id: string; name: string; isSystemRole: boolean } | null
  permissions: string[]
  scopes: Record<string, PermissionScope>
  lastLoginAt: string | null
}

export interface AdminTokens {
  accessToken: string
  refreshToken: string
  expiresIn: string
}

export interface RolePermissionEntry {
  permission: string
  scope: PermissionScope | null
}

export interface AdminRoleDetail {
  id: string
  name: string
  description: string | null
  isSystemRole: boolean
  permissions: RolePermissionEntry[]
  memberCount: number
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface PermissionCatalogEntry {
  permission: string
  module: string
  description: string
  superAdminOnly?: boolean
}

export interface AdminUserSummary {
  id: string
  name: string
  email: string
  isActive: boolean
  isSuperAdmin: boolean
  mustChangePassword: boolean
  role: { id: string; name: string; isSystemRole: boolean } | null
  lastLoginAt: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface Paginated<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface BusinessSummary {
  id: string
  name: string
  slug: string
  type: string
  city: string | null
  plan: string
  subscriptionStatus: string
  businessStatus: string
  trialEndsAt: string | null
  ownerName: string | null
  ownerPhone: string | null
  memberCount: number
  createdAt: string
}

export interface BusinessOverrideEntry {
  id: string
  resource: string
  granted: boolean
  reason: string
  grantedBy: string
  grantedAt: string
  expiresAt: string | null
}

export interface BusinessDetail extends BusinessSummary {
  country: string
  phone: string | null
  email: string | null
  billingCycle: string
  owner: { id: string; name: string; phone: string; email: string | null } | null
  members: { userId: string; name: string | null; role: string; status: string }[]
  overrides: BusinessOverrideEntry[]
  subscriptionHistory: {
    event: string
    fromPlan: string | null
    toPlan: string | null
    at: string
  }[]
  recentSync: {
    deviceId: string
    status: string
    failedCount: number
    conflictCount: number
    lastError: string | null
    at: string
  }[]
}

export interface ClientUserSummary {
  id: string
  name: string
  phone: string
  email: string | null
  status: string
  role: string
  isActive: boolean
  businessId: string | null
  createdAt: string
}

export interface ClientUserDetail extends ClientUserSummary {
  isEmailVerified: boolean
  isPhoneVerified: boolean
  onboardingStep: string
  language: string
  lockedUntil: string | null
  memberships: { businessId: string; businessName: string | null; role: string; status: string }[]
}

export interface SupportTicketItem {
  id: string
  businessId: string | null
  userId: string | null
  title: string
  description: string
  category: string
  severity: string
  status: string
  resolution: string | null
  assignedTo: string | null
  resolvedAt: string | null
  createdAt: string
}

export interface SyncErrorRow {
  businessId: string
  businessName: string | null
  failedCount: number
  conflictCount: number
  batchCount: number
  lastSyncAt: string
}
