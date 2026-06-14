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

export type AuditDeviceType =
  | 'DESKTOP_APP'
  | 'MOBILE_APP'
  | 'WEB_BROWSER'
  | 'API'
  | 'SYSTEM'

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
}

/** The auditable event itself (what happened to which entity). */
export interface AuditData {
  action: AuditAction
  entityType: string
  entityId: string
  entityLabel?: string | null
  changes?: AuditChanges | null
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
