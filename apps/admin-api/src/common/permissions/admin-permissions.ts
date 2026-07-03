/**
 * The full admin permission space. Permissions follow the `{module}:{action}`
 * pattern. This catalog is the single source of truth consumed by:
 *  - the seed script (baseline role permission sets)
 *  - role create/update validation (only declared permissions are assignable)
 *  - the GET /admin/roles/permissions endpoint (populates the role-editor UI)
 */
export interface AdminPermissionDef {
  permission: string
  module: string
  description: string
  /** Reserved for SUPER_ADMIN only — cannot be granted to a custom/baseline role. */
  superAdminOnly?: boolean
}

export const ADMIN_PERMISSIONS: AdminPermissionDef[] = [
  // businesses
  { permission: 'businesses:view', module: 'businesses', description: 'View business list and details' },
  { permission: 'businesses:suspend', module: 'businesses', description: 'Suspend or activate a business' },
  { permission: 'businesses:override_permissions', module: 'businesses', description: 'Grant/revoke plan-level resource overrides' },
  { permission: 'businesses:delete', module: 'businesses', description: 'Permanently delete a business', superAdminOnly: true },

  // users (client users)
  { permission: 'users:view', module: 'users', description: 'View client user list and details' },
  { permission: 'users:suspend', module: 'users', description: 'Suspend or activate a user account' },
  { permission: 'users:resend_otp', module: 'users', description: 'Trigger a new OTP for a stuck user' },
  { permission: 'users:delete', module: 'users', description: 'Permanently delete a user', superAdminOnly: true },

  // revenue
  { permission: 'revenue:view', module: 'revenue', description: 'View MRR, ARR, churn, conversion metrics' },

  // subscriptions
  { permission: 'subscriptions:view', module: 'subscriptions', description: 'View subscription status for all businesses' },
  { permission: 'subscriptions:edit', module: 'subscriptions', description: 'Manually adjust plan, trial dates, status' },

  // payments
  { permission: 'payments:view', module: 'payments', description: 'View all payment transactions' },
  { permission: 'payments:retry', module: 'payments', description: 'Trigger a retry on a failed payment' },
  { permission: 'payments:waive', module: 'payments', description: 'Mark a failed payment as waived' },

  // support
  { permission: 'support:view', module: 'support', description: 'View all support tickets' },
  { permission: 'support:create_ticket', module: 'support', description: 'Create a new support ticket' },
  { permission: 'support:resolve_ticket', module: 'support', description: 'Mark tickets as resolved/closed' },
  { permission: 'support:assign_ticket', module: 'support', description: 'Assign tickets to admin team members' },

  // sync_errors
  { permission: 'sync_errors:view', module: 'sync_errors', description: 'View sync error logs' },
  { permission: 'sync_errors:resolve', module: 'sync_errors', description: 'Acknowledge and trigger manual sync' },

  // plans
  { permission: 'plans:view', module: 'plans', description: 'View plan configurations and resource lists' },
  { permission: 'plans:edit', module: 'plans', description: 'Modify what resources a plan includes' },

  // metrics
  { permission: 'metrics:view', module: 'metrics', description: 'View platform overview metrics' },

  // audit_logs
  { permission: 'audit_logs:view', module: 'audit_logs', description: 'View the full admin audit log', superAdminOnly: true },

  // admin_users
  { permission: 'admin_users:view', module: 'admin_users', description: 'View admin team member list' },
  { permission: 'admin_users:manage', module: 'admin_users', description: 'Create/edit/deactivate admin users', superAdminOnly: true },

  // admin_roles
  { permission: 'admin_roles:view', module: 'admin_roles', description: 'View all roles and their permissions' },
  { permission: 'admin_roles:manage', module: 'admin_roles', description: 'Create/edit/delete dynamic roles', superAdminOnly: true },
]

export const ALL_PERMISSIONS: string[] = ADMIN_PERMISSIONS.map((p) => p.permission)

const PERMISSION_SET = new Set(ALL_PERMISSIONS)
const SUPER_ADMIN_ONLY_SET = new Set(
  ADMIN_PERMISSIONS.filter((p) => p.superAdminOnly).map((p) => p.permission),
)

export const isValidPermission = (permission: string): boolean => PERMISSION_SET.has(permission)

export const isSuperAdminOnlyPermission = (permission: string): boolean =>
  SUPER_ADMIN_ONLY_SET.has(permission)

/** System role names. Names are reserved and cannot be created/renamed via the API. */
export const SYSTEM_ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  FINANCE: 'FINANCE',
  SUPPORT: 'SUPPORT',
  TECHNICAL: 'TECHNICAL',
} as const

export const RESERVED_ROLE_NAMES: string[] = Object.values(SYSTEM_ROLES)

/** Default baseline permission sets (seeded; editable by SUPER_ADMIN afterwards). */
export const FINANCE_DEFAULT: string[] = [
  'revenue:view',
  'payments:view',
  'payments:retry',
  'payments:waive',
  'subscriptions:view',
  'subscriptions:edit',
  'businesses:view',
]

export const SUPPORT_DEFAULT: string[] = [
  'businesses:view',
  'businesses:suspend',
  'businesses:override_permissions',
  'users:view',
  'users:suspend',
  'users:resend_otp',
  'support:view',
  'support:create_ticket',
  'support:resolve_ticket',
  'sync_errors:view',
  'sync_errors:resolve',
]

export const TECHNICAL_DEFAULT: string[] = [
  'businesses:view',
  'sync_errors:view',
  'sync_errors:resolve',
  'plans:view',
  'plans:edit',
  'metrics:view',
]
