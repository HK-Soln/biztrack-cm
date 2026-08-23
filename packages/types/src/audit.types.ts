import type { IsoDateString, ListQuery } from './http.types'

export type AuditActorType = 'BUSINESS_USER' | 'AGENT' | 'SYSTEM' | 'PUBLIC'

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'HARD_DELETE'
  | 'RESTORE'
  | 'VOID'
  | 'EXPORT'
  | 'LOGIN'
  | 'LOGOUT'
  | 'FAILED_LOGIN'
  | 'PLAN_CHANGE'
  | 'PERMISSION_CHANGE'
  // BIZ-2.9 — financially/security sensitive domain events (single union across both runtimes).
  | 'SALE_VOIDED'
  | 'DISCOUNT_APPLIED'
  | 'PRICE_CHANGED'
  | 'STOCK_ADJUSTED'
  | 'CASH_MOVEMENT'
  | 'SHIFT_OPENED'
  | 'SHIFT_CLOSED'
  | 'USER_ROLE_CHANGED'
  | 'RECEIPT_REPRINTED'
  | 'DEVICE_TIME_CHANGED'
  | 'SALE_LINE_REMOVED'
  | 'PIN_FAILED'
  | 'PIN_LOCKED'

export type AuditDeviceType = 'DESKTOP_APP' | 'MOBILE_APP' | 'WEB_BROWSER' | 'API' | 'SYSTEM'

export interface AuditChanges {
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
}

/** Request/actor context resolved from the JWT + headers, passed to AuditService. */
export interface AuditContext {
  businessId: string | null
  actorId: string | null
  actorType: AuditActorType
  actorName?: string | null
  actorRole?: string | null
  ipAddress?: string | null
  deviceId?: string | null
  deviceType?: AuditDeviceType | null
  deviceInfo?: Record<string, unknown> | null
  requestId?: string | null
  /** The originating device's own clock reading (BIZ-2.7). Client-reported, NEVER trusted as
   * authoritative — compared against the server-stamped `serverTime` to detect clock skew. */
  deviceTime?: IsoDateString | null
  /** Monotonic per-device event counter (BIZ-2.9) — a gap or rewind reveals tampering. The
   * device stamps its own; the server receives it via the bridge. */
  sequence?: number | null
}

/** The auditable event itself (what happened to which entity). */
export interface AuditData {
  action: AuditAction
  entityType: string
  entityId: string
  entityLabel?: string | null
  changes?: AuditChanges | null
  /** Money impact of the event in whole XAF (BIZ-2.7), denormalised so money-impact queries
   * don't have to reach into `changes`. Null for events that move no money. */
  amount?: number | null
}

export interface AuditLog {
  id: string
  businessId: string
  actorId: string | null
  actorType: AuditActorType
  actorName: string | null
  actorRole: string | null
  action: AuditAction
  entityType: string
  entityId: string
  entityLabel: string | null
  changes: AuditChanges | null
  ipAddress: string | null
  deviceId: string | null
  deviceType: AuditDeviceType | null
  deviceInfo: Record<string, unknown> | null
  requestId: string | null
  /** Device clock reading (client-reported, untrusted) — BIZ-2.7. */
  deviceTime?: IsoDateString | null
  /** Server-stamped ingest time (authoritative) — BIZ-2.7. Null on a device row until the
   * server ingests it. */
  serverTime?: IsoDateString | null
  /** Money impact in whole XAF, or null — BIZ-2.7. */
  amount?: number | null
  /** Monotonic per-device event counter (BIZ-2.9). */
  sequence?: number | null
  /** Set when the device clock ran ahead of the server ingest time (BIZ-2.9). Server-derived
   * (device_time > server_time); null on a device row where server_time isn't known yet. */
  clockSkew?: boolean | null
  createdAt: IsoDateString
}

export interface QueryAuditLogRequest extends ListQuery {
  entityType?: string
  entityId?: string
  actorId?: string
  action?: AuditAction
  from?: string
  to?: string
}
