export interface RoleItem {
  id: string
  businessId: string
  name: string
  description: string | null
  isSystem: boolean
  isOwnerRole: boolean
  /** Members with this role may set a manager PIN and authorize till step-up. */
  canAuthorize: boolean
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

export interface CreateRoleRequest {
  name: string
  description?: string
  permissions: string[]
  colour?: string
  canAuthorize?: boolean
}

export interface UpdateRoleRequest {
  name?: string
  description?: string
  colour?: string
  canAuthorize?: boolean
}

export interface SetRolePermissionsRequest {
  permissions: string[]
}

export interface AddRolePermissionRequest {
  permission: string
}
