import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { Request } from 'express'
import type { AuditActorType, AuditContext, AuditDeviceType } from '@biztrack/types'

const DEVICE_TYPES: AuditDeviceType[] = [
  'DESKTOP_APP',
  'MOBILE_APP',
  'WEB_BROWSER',
  'API',
  'SYSTEM',
]

function resolveActorType(user: { type?: string } | undefined): AuditActorType {
  if (!user) return 'PUBLIC'
  if (user.type === 'AGENT') return 'AGENT'
  return 'BUSINESS_USER'
}

function resolveDeviceType(value: unknown): AuditDeviceType | null {
  return typeof value === 'string' && DEVICE_TYPES.includes(value as AuditDeviceType)
    ? (value as AuditDeviceType)
    : null
}

function getIp(request: Request): string | null {
  const forwarded = request.headers['x-forwarded-for']
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0]?.trim() ?? null
  }
  return request.socket?.remoteAddress ?? null
}

/**
 * Resolve the actor + device context for the current request (Phase 3H).
 * Pass the result to AuditService.log().
 */
export const CurrentAuditContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuditContext => {
    const request = ctx.switchToHttp().getRequest<Request>()
    const user = (request as unknown as { user?: Record<string, unknown> }).user
    const header = (name: string): string | null => {
      const value = request.headers[name]
      return typeof value === 'string' ? value : null
    }

    return {
      businessId: (user?.businessId as string) ?? null,
      actorId: (user?.sub as string) ?? null,
      actorType: resolveActorType(user as { type?: string } | undefined),
      actorName: (user?.name as string) ?? null,
      actorRole: (user?.role as string) ?? null,
      ipAddress: getIp(request),
      deviceId: header('x-device-id'),
      deviceType: resolveDeviceType(request.headers['x-device-type']),
      deviceInfo: {
        platform: header('x-platform'),
        appVersion: header('x-app-version'),
        userAgent: header('user-agent'),
      },
      requestId: header('x-request-id'),
    }
  },
)
