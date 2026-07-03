import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Observable, tap } from 'rxjs'
import type { Logger } from '@biztrack/logger'
import { LOGGER } from '@/logger/logger.module'
import { AuditLog } from '@/entities/audit-log.entity'
import { AUDIT_ACTION_KEY } from '../decorators/audit-action.decorator'
import type { RequestWithId } from '../http/http-types'

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])
const SENSITIVE_KEYS = ['password', 'token', 'hash', 'secret', 'refreshtoken', 'accesstoken']

/**
 * Logs every successful mutating admin action to `audit_logs`. The role name is
 * denormalised (stored as a string) so historical entries survive role renames.
 * Sensitive request-body fields are stripped before persisting.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private reflector: Reflector,
    @InjectRepository(AuditLog) private auditRepo: Repository<AuditLog>,
    @Inject(LOGGER) private logger: Logger,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<RequestWithId>()
    const method = req.method?.toUpperCase()

    // Only audit mutations performed by an authenticated admin.
    if (!method || !MUTATING_METHODS.has(method) || !req.admin) {
      return next.handle()
    }

    const admin = req.admin
    const override = this.reflector.getAllAndOverride<string>(AUDIT_ACTION_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    return next.handle().pipe(
      tap({
        next: () => {
          void this.record(req, admin.sub, admin.role, override)
        },
      }),
    )
  }

  private async record(
    req: RequestWithId,
    adminUserId: string,
    roleName: string,
    override?: string,
  ): Promise<void> {
    try {
      const routePath: string = (req.route?.path as string) ?? req.path
      const action = override ?? `${req.method} ${routePath}`
      const params = (req.params ?? {}) as Record<string, string>

      const entry = this.auditRepo.create({
        adminUserId,
        adminRoleName: roleName,
        action: action.slice(0, 100),
        entityType: this.deriveEntityType(routePath),
        entityId: this.deriveEntityId(params),
        payload: this.sanitize(req.body),
        ipAddress: this.normalizeIp(req.ip ?? req.socket?.remoteAddress ?? 'unknown').slice(0, 45),
        userAgent: String(req.headers['user-agent'] ?? 'unknown').slice(0, 255),
      })
      await this.auditRepo.save(entry)
    } catch (error) {
      // Auditing must never break the request it follows.
      this.logger.error('Failed to write audit log', 'AuditInterceptor', {
        requestId: req.id,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /** /api/v1/admin/businesses/:id/status -> "businesses" */
  private deriveEntityType(routePath: string): string {
    const segments = routePath.split('/').filter(Boolean)
    const adminIdx = segments.indexOf('admin')
    const segment = adminIdx >= 0 ? segments[adminIdx + 1] : segments[0]
    return (segment ?? 'unknown').slice(0, 50)
  }

  private deriveEntityId(params: Record<string, string>): string | null {
    const candidate = params.id ?? params.businessId ?? params.userId ?? params.overrideId
    return candidate && /^[0-9a-f-]{36}$/i.test(candidate) ? candidate : null
  }

  private sanitize(body: unknown): Record<string, unknown> | null {
    if (!body || typeof body !== 'object') return null
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.includes(key.toLowerCase())) {
        out[key] = '[REDACTED]'
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        out[key] = this.sanitize(value)
      } else {
        out[key] = value
      }
    }
    return out
  }

  private normalizeIp(ip: string): string {
    return ip.startsWith('::ffff:') ? ip.slice('::ffff:'.length) : ip
  }
}
