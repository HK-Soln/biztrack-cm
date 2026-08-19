import type { HttpClient } from '@biztrack/http-client'
import type {
  AddNotificationRecipientRequest,
  NotificationRecipientLookupResult,
  NotificationSettings,
  UpdateNotificationMatrixRequest,
  UpdateNotificationQuietHoursRequest,
  UpdateNotificationRecipientRequest,
  UpdateRecipientSubscriptionsRequest,
} from '@biztrack/types'

type ApiEnvelope<T> = { success?: boolean; data: T }

/**
 * Desktop proxy for the Settings → Notifications control plane. Server-owned,
 * online-only, proxied through main via authHttp (tokens never reach the renderer).
 * Mirrors the notification-feed proxy; there is no offline mirror — notification
 * preferences are read server-side at dispatch time.
 */
export class NotificationSettingsService {
  constructor(private readonly http: HttpClient) {}

  async get(): Promise<NotificationSettings> {
    return (await this.http.get<ApiEnvelope<NotificationSettings>>('/notifications/settings')).data
      .data
  }

  async lookupContact(q: string): Promise<NotificationRecipientLookupResult> {
    return (
      await this.http.get<ApiEnvelope<NotificationRecipientLookupResult>>(
        `/notifications/settings/recipients/lookup?q=${encodeURIComponent(q)}`,
      )
    ).data.data
  }

  async updateMatrix(body: UpdateNotificationMatrixRequest): Promise<NotificationSettings> {
    return (
      await this.http.put<ApiEnvelope<NotificationSettings>>('/notifications/settings/matrix', body)
    ).data.data
  }

  async updateQuietHours(body: UpdateNotificationQuietHoursRequest): Promise<NotificationSettings> {
    return (
      await this.http.put<ApiEnvelope<NotificationSettings>>(
        '/notifications/settings/quiet-hours',
        body,
      )
    ).data.data
  }

  async addRecipient(body: AddNotificationRecipientRequest): Promise<NotificationSettings> {
    return (
      await this.http.post<ApiEnvelope<NotificationSettings>>(
        '/notifications/settings/recipients',
        body,
      )
    ).data.data
  }

  async updateRecipient(
    id: string,
    body: UpdateNotificationRecipientRequest,
  ): Promise<NotificationSettings> {
    return (
      await this.http.put<ApiEnvelope<NotificationSettings>>(
        `/notifications/settings/recipients/${id}`,
        body,
      )
    ).data.data
  }

  async updateRecipientSubscriptions(
    id: string,
    body: UpdateRecipientSubscriptionsRequest,
  ): Promise<NotificationSettings> {
    return (
      await this.http.put<ApiEnvelope<NotificationSettings>>(
        `/notifications/settings/recipients/${id}/subscriptions`,
        body,
      )
    ).data.data
  }

  async removeRecipient(id: string): Promise<NotificationSettings> {
    return (
      await this.http.delete<ApiEnvelope<NotificationSettings>>(
        `/notifications/settings/recipients/${id}`,
      )
    ).data.data
  }
}
