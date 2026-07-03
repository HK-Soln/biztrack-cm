import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { Reflector } from '@nestjs/core'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'
import { ADMIN_JWT_STRATEGY } from './admin-jwt.strategy'
import type { AdminJwtPayload } from '../auth/admin-jwt-payload'
import type { RequestWithId } from '../http/http-types'

@Injectable()
export class AdminJwtGuard extends AuthGuard(ADMIN_JWT_STRATEGY) {
  constructor(private reflector: Reflector) {
    super()
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true
    return super.canActivate(context)
  }

  // Attach the validated payload to `req.admin` (passport defaults to `req.user`).
  handleRequest<TUser = AdminJwtPayload>(err: unknown, user: TUser, _info: unknown, context: ExecutionContext): TUser {
    if (err || !user) {
      throw err instanceof Error ? err : new UnauthorizedException()
    }
    const req = context.switchToHttp().getRequest<RequestWithId>()
    req.admin = user as unknown as AdminJwtPayload
    return user
  }
}
