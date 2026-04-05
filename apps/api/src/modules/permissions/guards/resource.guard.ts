import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { PermissionsService } from '../permissions.service'
import type { Resource } from '@biztrack/types'
import { I18nService } from 'nestjs-i18n'
import type { I18nTranslations } from '@/i18n/i18n.types'

export const RequireResource = (resource: Resource) => SetMetadata('required_resource', resource)

@Injectable()
export class ResourceGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private permissionsService: PermissionsService,
    private i18n: I18nService<I18nTranslations>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.get<Resource>('required_resource', context.getHandler())
    if (!required) return true

    const req = context.switchToHttp().getRequest()
    const businessId = req.user?.businessId
    if (!businessId) throw new ForbiddenException()

    const permissions = await this.permissionsService.getEffectivePermissions(businessId)
    if (!permissions.includes(required)) {
      const requiredPlan = await this.permissionsService.getMinimumPlanFor(required)
      throw new ForbiddenException({
        code: 'PLAN_UPGRADE_REQUIRED',
        resource: required,
        requiredPlan,
        message: await this.i18n.translate('errors.plan_upgrade_required', {
          args: { plan: requiredPlan },
        }),
      })
    }

    return true
  }
}
