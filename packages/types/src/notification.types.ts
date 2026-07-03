import type { IsoDateString } from './http.types'

// ---------------------------------------------------------------------------
// Notification primitives — shared across API ⇄ desktop ⇄ web. The API entity
// (`apps/api/src/entities/notification.entity.ts`) re-exports these so server
// code and the frontend agree on a single source of truth.
// ---------------------------------------------------------------------------

export enum NotificationChannel {
  EMAIL = 'email',
  SMS = 'sms',
  WHATSAPP = 'whatsapp',
  IN_APP = 'in_app',
}

export enum NotificationType {
  INVITE = 'invite',
  OTP = 'otp',
  PAYMENT_REMINDER = 'payment_reminder',
  MARKETING = 'marketing',
}

export enum NotificationStatus {
  PENDING = 'pending',
  QUEUED = 'queued',
  SENT = 'sent',
  DELIVERED = 'delivered',
  FAILED = 'failed',
}

// ---------------------------------------------------------------------------
// In-app notification feed (bell/banner) — REST responses + realtime payload.
// ---------------------------------------------------------------------------

/** A single in-app notification as shown in the bell/banner feed. */
export interface NotificationItem {
  id: string
  type: NotificationType
  title: string
  body: string
  /** Internal route the bell/banner navigates to on click (e.g. `/invitations/:token`). */
  deeplink: string | null
  read: boolean
  createdAt: IsoDateString
}

export interface ListNotificationsQuery {
  page?: number
  limit?: number
}

export interface ListNotificationsResponse {
  items: NotificationItem[]
  total: number
  page: number
  limit: number
  unreadCount: number
}

export interface UnreadCountResponse {
  count: number
}

export interface MarkNotificationReadResponse {
  id: string
  read: boolean
}

export interface MarkAllNotificationsReadResponse {
  updated: number
}

/** Realtime payload pushed to a user's room on the `notification` socket event. */
export interface NotificationEventPayload {
  notification: NotificationItem
  unreadCount: number
}
