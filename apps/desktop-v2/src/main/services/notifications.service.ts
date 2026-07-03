import type { HttpClient } from '@biztrack/http-client'
import type {
  AcceptInvitationResponse,
  ListMyInvitationsResponse,
  ListNotificationsQuery,
  ListNotificationsResponse,
  MarkAllNotificationsReadResponse,
  MarkNotificationReadResponse,
  RejectInvitationResponse,
  UnreadCountResponse,
} from '@biztrack/types'

type ApiEnvelope<T> = { success?: boolean; data: T }

/**
 * Desktop proxy for the per-user in-app notification feed + invitee-side invitation
 * accept/reject. Server-owned, online-only, proxied through main via authHttp (tokens
 * never reach the renderer). Realtime delivery is handled separately by RealtimeClient.
 */
export class NotificationsService {
  constructor(private readonly http: HttpClient) {}

  // ---- notification feed ----
  async list(query: ListNotificationsQuery = {}): Promise<ListNotificationsResponse> {
    const params = new URLSearchParams()
    if (query.page) params.set('page', String(query.page))
    if (query.limit) params.set('limit', String(query.limit))
    const qs = params.toString()
    return (
      await this.http.get<ApiEnvelope<ListNotificationsResponse>>(
        `/notifications${qs ? `?${qs}` : ''}`,
      )
    ).data.data
  }

  async unreadCount(): Promise<UnreadCountResponse> {
    return (await this.http.get<ApiEnvelope<UnreadCountResponse>>('/notifications/unread-count')).data.data
  }

  async markRead(id: string): Promise<MarkNotificationReadResponse> {
    return (await this.http.patch<ApiEnvelope<MarkNotificationReadResponse>>(`/notifications/${id}/read`, {})).data.data
  }

  async markAllRead(): Promise<MarkAllNotificationsReadResponse> {
    return (await this.http.patch<ApiEnvelope<MarkAllNotificationsReadResponse>>('/notifications/read-all', {})).data.data
  }

  // ---- invitee-side invitations (existing-user pending memberships) ----
  async listInvitations(): Promise<ListMyInvitationsResponse> {
    return (await this.http.get<ApiEnvelope<ListMyInvitationsResponse>>('/businesses/invitations')).data.data
  }

  async acceptInvitation(businessId: string): Promise<AcceptInvitationResponse> {
    return (
      await this.http.post<ApiEnvelope<AcceptInvitationResponse>>(
        `/businesses/invitations/${businessId}/accept`,
        {},
      )
    ).data.data
  }

  async rejectInvitation(businessId: string): Promise<RejectInvitationResponse> {
    return (
      await this.http.post<ApiEnvelope<RejectInvitationResponse>>(
        `/businesses/invitations/${businessId}/reject`,
        {},
      )
    ).data.data
  }
}
