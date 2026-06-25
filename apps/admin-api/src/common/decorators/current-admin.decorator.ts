import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import type { AdminJwtPayload } from '../auth/admin-jwt-payload'
import type { RequestWithId } from '../http/http-types'

/** Injects the authenticated admin (from the JWT payload) into a handler param. */
export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AdminJwtPayload | undefined => {
    const req = ctx.switchToHttp().getRequest<RequestWithId>()
    return req.admin
  },
)

/** Injects the permission scope attached by AdminPermissionGuard for the matched permission. */
export const PermissionScopeParam = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<RequestWithId>()
  return req.permissionScope ?? null
})
