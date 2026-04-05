type Resource = string

type PermissionAccessInput = {
  effectivePermissions: Resource[]
  specialPermissions: Array<{
    resource: Resource
    grantedAt: number
    expiresAt: number | null
    grantedBy: string
    reason: string
    isRevocation: boolean
  }>
  permissionsExpiresAt: number
}

type PermissionAccessResult = {
  granted: boolean
  reason: 'PLAN' | 'SPECIAL_GRANT' | 'REVOKED' | 'PLAN_EXPIRED'
  expiresAt: number | null
  grantReason?: string
}

const FREE_PERMISSIONS: Resource[] = [
  'SALES_CREATE',
  'SALES_VIEW',
  'PRODUCTS_CREATE',
  'PRODUCTS_VIEW',
  'PRODUCTS_EDIT',
  'PRODUCTS_DELETE',
  'PRODUCTS_LIMIT_50',
  'INVENTORY_VIEW',
  'INVENTORY_ADJUST',
  'INVENTORY_ALERTS',
  'EXPENSES_CREATE',
  'EXPENSES_VIEW',
  'REPORTS_DAILY',
  'RECEIPTS_GENERATE',
  'RECEIPTS_WHATSAPP',
]

export const computePermissionAccess = (
  resource: Resource,
  auth: PermissionAccessInput,
  now: number = Date.now(),
): PermissionAccessResult => {
  const revocation = auth.specialPermissions.find(
    (p) => p.resource === resource && p.isRevocation && (!p.expiresAt || now < p.expiresAt),
  )
  if (revocation) {
    return {
      granted: false,
      reason: 'REVOKED',
      expiresAt: revocation.expiresAt ?? null,
    }
  }

  const grant = auth.specialPermissions.find(
    (p) => p.resource === resource && !p.isRevocation && (!p.expiresAt || now < p.expiresAt),
  )
  if (grant) {
    return {
      granted: true,
      reason: 'SPECIAL_GRANT',
      expiresAt: grant.expiresAt ?? null,
      grantReason: grant.reason,
    }
  }

  const planExpired = now > auth.permissionsExpiresAt
  if (planExpired) {
    return {
      granted: FREE_PERMISSIONS.includes(resource),
      reason: 'PLAN_EXPIRED',
      expiresAt: null,
    }
  }

  return {
    granted: auth.effectivePermissions.includes(resource),
    reason: 'PLAN',
    expiresAt: auth.permissionsExpiresAt,
  }
}
