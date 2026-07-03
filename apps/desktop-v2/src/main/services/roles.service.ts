import type { HttpClient } from '@biztrack/http-client'
import type {
  CreateRoleRequest,
  ListPermissionsResponse,
  ListRolesResponse,
  RoleWithPermissions,
  UpdateRoleRequest,
} from '@biztrack/types'

type ApiEnvelope<T> = { success?: boolean; data: T }

export interface RolesListQuery {
  page?: number
  limit?: number
  search?: string
}

/**
 * Desktop proxy for the roles/permissions API (Organization → Roles). Server-owned,
 * online-only (not in the offline sync set), proxied through main via authHttp so the
 * phase2 token never reaches the renderer. The cloud build calls the API directly.
 */
export class RolesService {
  constructor(private readonly http: HttpClient) {}

  async list(query: RolesListQuery = {}): Promise<ListRolesResponse> {
    const p = new URLSearchParams()
    if (query.page) p.set('page', String(query.page))
    if (query.limit) p.set('limit', String(query.limit))
    if (query.search) p.set('search', query.search)
    const qs = p.toString()
    return (await this.http.get<ApiEnvelope<ListRolesResponse>>(`/roles${qs ? `?${qs}` : ''}`)).data.data
  }

  async listPermissions(): Promise<ListPermissionsResponse> {
    return (await this.http.get<ApiEnvelope<ListPermissionsResponse>>('/roles/permissions')).data.data
  }

  async get(id: string): Promise<RoleWithPermissions> {
    return (await this.http.get<ApiEnvelope<RoleWithPermissions>>(`/roles/${id}`)).data.data
  }

  async create(input: CreateRoleRequest): Promise<RoleWithPermissions> {
    return (await this.http.post<ApiEnvelope<RoleWithPermissions>>('/roles', input)).data.data
  }

  async update(id: string, input: UpdateRoleRequest): Promise<RoleWithPermissions> {
    return (await this.http.patch<ApiEnvelope<RoleWithPermissions>>(`/roles/${id}`, input)).data.data
  }

  async remove(id: string): Promise<{ deleted: boolean }> {
    return (await this.http.delete<ApiEnvelope<{ deleted: boolean }>>(`/roles/${id}`)).data.data
  }

  async setPermissions(id: string, permissions: string[]): Promise<RoleWithPermissions> {
    return (await this.http.put<ApiEnvelope<RoleWithPermissions>>(`/roles/${id}/permissions`, { permissions })).data.data
  }
}
