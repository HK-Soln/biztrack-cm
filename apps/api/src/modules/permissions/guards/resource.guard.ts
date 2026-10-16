import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { PermissionsService } from '../permissions.service'
import type { Resource } from '@biztrack/types'
import { staffMay, type StaffAction } from '@biztrack/domain'
import { I18nService } from 'nestjs-i18n'
import type { I18nTranslations } from '@/i18n/i18n.types'
import { AppForbiddenException } from '@/common/exceptions/app-exceptions'

export const RequireResource = (resource: Resource) => SetMetadata('required_resource', resource)

/**
 * The member's role must allow the action, by @biztrack/domain's staffMay (ruling R21).
 * Checked by ResourceGuard after the plan check.
 */
export const RequireStaffAction = (action: StaffAction) =>
  SetMetadata('required_staff_action', action)

@Injectable()
export class ResourceGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private permissionsService: PermissionsService,
    private i18n: I18nService<I18nTranslations>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Handler-level metadata wins; otherwise fall back to a controller-level
    // @RequireResource (lets a whole controller be gated by one resource).
    const required = this.reflector.getAllAndOverride<Resource>('required_resource', [
      context.getHandler(),
      context.getClass(),
    ])
    const staffAction = this.reflector.get<StaffAction | undefined>(
      'required_staff_action',
      context.getHandler(),
    )
    const req = context.switchToHttp().getRequest()
    if (staffAction && !staffMay(req.user?.role, staffAction)) {
      throw new AppForbiddenException(
        await this.i18n.translate('errors.staff_action_forbidden'),
        'STAFF_ACTION_FORBIDDEN',
        { action: staffAction },
      )
    }
    if (!required) return true

    const businessId = req.user?.businessId
    if (!businessId) {
      throw new AppForbiddenException()
    }

    const permissions = await this.permissionsService.getEffectivePermissions(businessId)
    if (!permissions.includes(required)) {
      const requiredPlan = await this.permissionsService.getMinimumPlanFor(required)
      // Boolean feature denial stays a 403 even after quotas are introduced.
      // That keeps "this feature is not on your plan" separate from
      // "this feature is on your plan but you consumed the limit".
      throw new AppForbiddenException(
        await this.i18n.translate('errors.plan_upgrade_required', {
          args: { plan: requiredPlan },
        }),
        'PLAN_UPGRADE_REQUIRED',
        {
          resource: required,
          requiredPlan,
        },
      )
    }

    return true
  }
}
