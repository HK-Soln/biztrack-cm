import type { NotificationEventPayload } from './notification.types'
import type { SyncBatchStatusResponse, SyncChangesAvailableEvent } from './sync.types'

// ---------------------------------------------------------------------------
// Realtime contract — ONE source of truth shared by the API publisher and every
// client (desktop + cloud). The app-wide RealtimeModule (Socket.IO) authenticates
// with the ACCESS TOKEN only; the sync token stays scoped to SyncModule's HTTP API.
// ---------------------------------------------------------------------------

/** Server → client business events: event name → payload. New modules add entries. */
export interface RealtimeServerEvents {
  notification: NotificationEventPayload
  // Added when sync migrates onto the realtime module (published server-side):
  'sync.batch.status': SyncBatchStatusResponse
  'sync.changes.available': SyncChangesAvailableEvent
}

export type RealtimeServerEventName = keyof RealtimeServerEvents

/** Control frames (server → client) — outside the business event map. */
export type RealtimeControlEvent =
  | { event: 'auth:success'; data: { userId: string } }
  | { event: 'auth:expired' }
  | { event: 'subscribed'; data: { channel: string } }
  | { event: 'unsubscribed'; data: { channel: string } }
  | { event: 'error'; data: { code: string; message: string } }

/** Client → server frames (zod-validated server-side). */
export type RealtimeClientEvent =
  | { event: 'auth'; data: { accessToken: string } }
  | { event: 'subscribe'; data: { channel: string } }
  | { event: 'unsubscribe'; data: { channel: string } }

/** Socket.IO server path for the app-wide realtime channel (distinct from the legacy
 * sync realtime path so both can run during migration). */
export const REALTIME_PATH = '/api/v1/realtime'

/** The `auth` ack event name and the realtime `notification` event name as literals. */
export const REALTIME_AUTH_EVENT = 'auth' as const

// Channel naming — clients and server must agree byte-for-byte.
export const realtimeUserChannel = (userId: string): string => `user:${userId}`
export const realtimeBusinessChannel = (businessId: string, topic?: string): string =>
  topic ? `business:${businessId}:${topic}` : `business:${businessId}`
export const realtimeDeviceChannel = (deviceId: string): string => `device:${deviceId}`

/** App-level close codes (sent as the disconnect reason). */
export const REALTIME_CLOSE = {
  UNAUTHORIZED: 4001,
  AUTH_TIMEOUT: 4002,
  FORBIDDEN_CHANNEL: 4003,
  TOKEN_EXPIRED: 4004,
  RATE_LIMITED: 4005,
  REPLACED: 4006,
  REVOKED: 4007,
} as const

export type RealtimeCloseCode = (typeof REALTIME_CLOSE)[keyof typeof REALTIME_CLOSE]
