export const AUDIT_QUEUE = 'audit'
export const AUDIT_LOG_JOB = 'audit.log'

import type { AuditContext } from '@biztrack/types'

/** Context for events triggered by cron jobs, queue processors, or migrations. */
export const SYSTEM_AUDIT_CONTEXT: AuditContext = {
  businessId: null,
  actorId: null,
  actorType: 'SYSTEM',
  actorName: 'System',
  actorRole: null,
  ipAddress: null,
  deviceId: null,
  deviceType: 'SYSTEM',
  deviceInfo: null,
  requestId: null,
}
