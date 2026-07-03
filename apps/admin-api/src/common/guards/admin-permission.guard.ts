import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { REQUIRED_PERMISSION_KEY } from '../decorators/require-permission.decorator'
import { AppForbiddenException, AppUnauthorizedException } from '../exceptions/app.exception'
import type { RequestWithId } from '../http/http-types'

@Injectable()
export class AdminPermissionGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string>(REQUIRED_PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    // No permission declared on this handler ⇒ any authenticated admin may proceed.
    if (!required) return true

    const req = context.switchToHttp().getRequest<RequestWithId>()
    const admin = req.admin
    if (!admin) {
      throw new AppUnauthorizedException('Unauthorized', 'UNAUTHORIZED')
    }

    // SUPER_ADMIN bypasses all permission checks.
    if (admin.isSuperAdmin) return true

    if (!admin.permissions?.includes(required)) {
      throw new AppForbiddenException(
        `Your role does not have the '${required}' permission.`,
        'INSUFFICIENT_PERMISSIONS',
        { required },
      )
    }

    // Attach the scope (if any) so the service layer can constrain its query.
    req.permissionScope = admin.scopes?.[required] ?? null
    return true
  }
}
