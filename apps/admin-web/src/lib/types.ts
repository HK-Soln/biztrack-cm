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
