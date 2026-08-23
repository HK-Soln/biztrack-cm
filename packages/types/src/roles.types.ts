export interface RoleItem {
  id: string
  businessId: string
  name: string
  description: string | null
  isSystem: boolean
  isOwnerRole: boolean
  /** Members with this role may set a manager PIN and authorize till step-up. */
  canAuthorize: boolean
  /** Members with this role run a till — prompted to open a shift at login (BIZ-2.4). */
  tracksCashDrawer: boolean
  /** Per-role discount limits (BIZ-1.4); null = no limit. */
  maxDiscountPercent: number | null
  maxCartDiscountPercent: number | null
  maxDiscountAmountXaf: number | null
  allowBelowCost: boolean
  colour: string | null
  userCount: number
}

export interface RoleWithPermissions extends RoleItem {
  permissions: string[]
}

export interface PermissionCatalogItem {
  key: string
  label: string
  description: string
  group: string
}

export interface ListRolesResponse {
  roles: RoleItem[]
  total: number
  page: number
  limit: number
}

export interface ListPermissionsResponse {
  permissions: PermissionCatalogItem[]
}

/** Per-role discount limits; null clears a limit (no cap). */
export interface RoleDiscountLimits {
  maxDiscountPercent?: number | null
  maxCartDiscountPercent?: number | null
  maxDiscountAmountXaf?: number | null
  allowBelowCost?: boolean
}

export interface CreateRoleRequest extends RoleDiscountLimits {
  name: string
  description?: string
  permissions: string[]
  colour?: string
  canAuthorize?: boolean
  tracksCashDrawer?: boolean
}

export interface UpdateRoleRequest extends RoleDiscountLimits {
  name?: string
  description?: string
  colour?: string
  canAuthorize?: boolean
  tracksCashDrawer?: boolean
}

export interface SetRolePermissionsRequest {
  permissions: string[]
}

export interface AddRolePermissionRequest {
  permission: string
}
