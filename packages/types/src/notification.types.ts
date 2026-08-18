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
  // --- Configurable business events (the Settings notification matrix rows). Each is
  // owner-configurable per channel + per recipient and dispatched by the shared
  // NotificationDispatcher. See docs/design/notifications-initiative-plan.md. ---
  LOW_STOCK = 'low_stock',
  NEW_ORDER = 'new_order',
  PAYMENT_RECEIVED = 'payment_received',
  DEBT_DUE = 'debt_due',
  DAILY_SUMMARY = 'daily_summary',
  TEAM_ACTIVITY = 'team_activity',
  BILLING = 'billing',
}

/**
 * The subset of NotificationType that is owner-configurable (the 7 Settings matrix
 * rows). System types (INVITE/OTP/PAYMENT_REMINDER/MARKETING) are always sent and are
 * NOT part of the matrix.
 */
export type NotificationEvent =
  | NotificationType.LOW_STOCK
  | NotificationType.NEW_ORDER
  | NotificationType.PAYMENT_RECEIVED
  | NotificationType.DEBT_DUE
  | NotificationType.DAILY_SUMMARY
  | NotificationType.TEAM_ACTIVITY
  | NotificationType.BILLING

/** All configurable events, in the order the Settings matrix lists them. */
export const NOTIFICATION_EVENTS: readonly NotificationEvent[] = [
  NotificationType.LOW_STOCK,
  NotificationType.NEW_ORDER,
  NotificationType.PAYMENT_RECEIVED,
  NotificationType.DEBT_DUE,
  NotificationType.DAILY_SUMMARY,
  NotificationType.TEAM_ACTIVITY,
  NotificationType.BILLING,
]

/** All channels, in the order the Settings matrix lists them (columns). */
export const NOTIFICATION_CHANNELS: readonly NotificationChannel[] = [
  NotificationChannel.IN_APP,
  NotificationChannel.EMAIL,
  NotificationChannel.SMS,
  NotificationChannel.WHATSAPP,
]

/**
 * Channels that cannot currently be enabled because there is no real provider behind
 * them. SMS is routed through WAHA (a WhatsApp transport, not an SMS gateway), so it
 * stays off — its Settings toggle is disabled and the dispatcher hard-skips it — until
 * a dedicated SMS provider is wired (N3).
 */
export const UNAVAILABLE_NOTIFICATION_CHANNELS: readonly NotificationChannel[] = [
  NotificationChannel.SMS,
]

export function isNotificationChannelAvailable(channel: NotificationChannel): boolean {
  return !UNAVAILABLE_NOTIFICATION_CHANNELS.includes(channel)
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

// ---------------------------------------------------------------------------
// Notification preferences (the Settings → Notifications control plane). The
// owner configures a business-level event×channel matrix + quiet hours, plus a
// per-recipient subscription (which alerts each added recipient receives). The
// shared NotificationDispatcher reads these before fanning out.
// ---------------------------------------------------------------------------

/** One (event, channel) cell of the business notification matrix. */
export interface NotificationChannelToggle {
  event: NotificationEvent
  channel: NotificationChannel
  enabled: boolean
}

/** Business-level quiet hours — hold non-urgent notifications overnight. */
export interface NotificationQuietHours {
  enabled: boolean
  /** Local 'HH:mm' (24h). */
  from: string
  /** Local 'HH:mm' (24h). */
  until: string
}

/** A person who can receive this business's notifications (owner or added member). */
export interface NotificationRecipient {
  id: string
  /** The linked business user, when the recipient is a team member. */
  userId: string | null
  name: string
  email: string | null
  phone: string | null
  emailVerified: boolean
  phoneVerified: boolean
  isOwner: boolean
  /** Which events this recipient is subscribed to (per-recipient routing). */
  subscriptions: Record<NotificationEvent, boolean>
}

/** Full notification-settings payload for the Settings tab (one GET). */
export interface NotificationSettings {
  matrix: NotificationChannelToggle[]
  quietHours: NotificationQuietHours
  recipients: NotificationRecipient[]
  /** Channels with no live provider (echoed so the UI can disable their toggles). */
  unavailableChannels: NotificationChannel[]
}

export interface UpdateNotificationMatrixRequest {
  /** Cells to upsert; unlisted cells are left unchanged. */
  toggles: NotificationChannelToggle[]
}

export type UpdateNotificationQuietHoursRequest = NotificationQuietHours

export interface AddNotificationRecipientRequest {
  /** Link to a business member; omit for a bare email/phone recipient. */
  userId?: string | null
  name: string
  email?: string | null
  phone?: string | null
}

export interface UpdateRecipientSubscriptionsRequest {
  /** Events to set for this recipient; unlisted events are left unchanged. */
  subscriptions: Partial<Record<NotificationEvent, boolean>>
}
