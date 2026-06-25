import { SetMetadata } from '@nestjs/common'

export const AUDIT_ACTION_KEY = 'audit_action'

/**
 * Optionally overrides the auto-derived audit action name for a handler.
 * When absent, the AuditInterceptor derives the action from the HTTP method + route.
 */
export const AuditAction = (action: string) => SetMetadata(AUDIT_ACTION_KEY, action)
