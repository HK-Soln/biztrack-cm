import type { HttpClient } from '@biztrack/http-client'
import type {
  CancelInviteResponse,
  ListPendingInvitesResponse,
  ListTeamMembersResponse,
  RemoveTeamMemberResponse,
  ResendInviteResponse,
  SendInviteRequest,
  SendInviteResponse,
  UpdateMemberRoleResponse,
  UpdateMemberStatusResponse,
} from '@biztrack/types'

type ApiEnvelope<T> = { success?: boolean; data: T }

/**
 * Desktop proxy for team-member + invite management (Organization → Team). Server-owned,
 * online-only, proxied through main via authHttp (tokens never reach the renderer).
 */
export class TeamService {
  constructor(private readonly http: HttpClient) {}

  async listMembers(): Promise<ListTeamMembersResponse> {
    return (await this.http.get<ApiEnvelope<ListTeamMembersResponse>>('/businesses/members')).data.data
  }

  async updateMemberRole(userId: string, roleId: string): Promise<UpdateMemberRoleResponse> {
    return (await this.http.patch<ApiEnvelope<UpdateMemberRoleResponse>>(`/businesses/members/${userId}/role`, { roleId })).data.data
  }

  async removeMember(userId: string): Promise<RemoveTeamMemberResponse> {
    return (await this.http.delete<ApiEnvelope<RemoveTeamMemberResponse>>(`/businesses/members/${userId}`)).data.data
  }

  async setMemberActive(userId: string, active: boolean): Promise<UpdateMemberStatusResponse> {
    return (await this.http.patch<ApiEnvelope<UpdateMemberStatusResponse>>(`/businesses/members/${userId}/status`, { active })).data.data
  }

  // ---- invites ----
  async listInvites(): Promise<ListPendingInvitesResponse> {
    return (await this.http.get<ApiEnvelope<ListPendingInvitesResponse>>('/invites')).data.data
  }

  async sendInvite(input: SendInviteRequest): Promise<SendInviteResponse> {
    return (await this.http.post<ApiEnvelope<SendInviteResponse>>('/invites', input)).data.data
  }

  async resendInvite(id: string): Promise<ResendInviteResponse> {
    return (await this.http.post<ApiEnvelope<ResendInviteResponse>>(`/invites/${id}/resend`, {})).data.data
  }

  async cancelInvite(id: string): Promise<CancelInviteResponse> {
    return (await this.http.delete<ApiEnvelope<CancelInviteResponse>>(`/invites/${id}`)).data.data
  }
}
