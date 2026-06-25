/**
 * Optional constraint that limits which records a permission applies to.
 * Enforced server-side in the service layer (AND-ed into queries).
 */
export interface PermissionScope {
  city?: string
  plan?: string
}

/**
 * Shape of the admin access-token JWT payload. Permissions are embedded so the
 * guard can authorize without a DB query on every request. Token TTL is short
 * (1h) so role changes propagate on the next refresh.
 */
export interface AdminJwtPayload {
  sub: string // adminUserId
  role: string // role name, e.g. "SUPPORT"
  isSuperAdmin: boolean
  permissions: string[]
  scopes: Record<string, PermissionScope>
  iat?: number
  exp?: number
}
