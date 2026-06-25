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
