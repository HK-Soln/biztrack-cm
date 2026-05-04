// Permission strings — must match admin-api permission definitions.
// Safe to import from both client and server components.
export const PERMISSIONS = {
  METRICS_VIEW: 'metrics:view',

  BUSINESSES_VIEW: 'businesses:view',
  BUSINESSES_SUSPEND: 'businesses:suspend',
  BUSINESSES_OVERRIDE: 'businesses:override_permissions',

  USERS_VIEW: 'users:view',
  USERS_SUSPEND: 'users:suspend',
  USERS_RESEND_OTP: 'users:resend_otp',

  REVENUE_VIEW: 'revenue:view',

  SUBSCRIPTIONS_VIEW: 'subscriptions:view',
  SUBSCRIPTIONS_EDIT: 'subscriptions:edit',

  PAYMENTS_VIEW: 'payments:view',
  PAYMENTS_RETRY: 'payments:retry',
  PAYMENTS_WAIVE: 'payments:waive',

  SUPPORT_VIEW: 'support:view',
  SUPPORT_CREATE_TICKET: 'support:create_ticket',
  SUPPORT_UPDATE_TICKET: 'support:update_ticket',
  SYNC_ERRORS_RESOLVE: 'sync_errors:resolve',

  PLANS_VIEW: 'plans:view',
  PLANS_EDIT: 'plans:edit',

  ADMIN_USERS_VIEW: 'admin_users:view',
  ADMIN_USERS_MANAGE: 'admin_users:manage',

  ADMIN_ROLES_VIEW: 'admin_roles:view',
  ADMIN_ROLES_MANAGE: 'admin_roles:manage',

  AUDIT_LOGS_VIEW: 'audit_logs:view',
} as const

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

export function hasPermission(
  permissions: string[],
  isSuperAdmin: boolean,
  required: Permission | string,
): boolean {
  if (isSuperAdmin) return true
  return permissions.includes(required)
}

export function hasAnyPermission(
  permissions: string[],
  isSuperAdmin: boolean,
  required: Array<Permission | string>,
): boolean {
  if (isSuperAdmin) return true
  return required.some((p) => permissions.includes(p))
}
