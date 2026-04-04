import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { OnboardingStep } from '@/entities/user.entity'
import { I18nService } from 'nestjs-i18n'
import type { I18nTranslations } from '@/i18n/i18n.types'
import { BusinessesRepository } from '@/modules/business/repositories/businesses.repository'
import { BusinessStatus } from '@biztrack/types'

export const RequireOnboardingStep = (step: OnboardingStep) => SetMetadata('required_onboarding_step', step)

@Injectable()
export class OnboardingGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private i18n: I18nService<I18nTranslations>,
    private businessesRepo: BusinessesRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.get<OnboardingStep>('required_onboarding_step', context.getHandler())
    if (!required) return true

    const req = context.switchToHttp().getRequest()
    const user = req.user

    if (!user) {
      throw new ForbiddenException({
        code: 'WRONG_ONBOARDING_STEP',
        currentStep: null,
        requiredStep: required,
        message: await this.i18n.translate('errors.wrong_onboarding_step'),
      })
    }

    if (required === OnboardingStep.SELECT_PLAN) {
      const businessId = user.businessId
      const business = businessId ? await this.businessesRepo.findOne({ where: { id: businessId } }) : null
      if (!business || business.businessStatus !== BusinessStatus.PLAN_PENDING) {
        throw new ForbiddenException({
          code: 'WRONG_ONBOARDING_STEP',
          currentStep: business?.businessStatus ?? null,
          requiredStep: required,
          message: await this.i18n.translate('errors.wrong_onboarding_step'),
        })
      }
      return true
    }

    if (user.onboardingStep !== required) {
      throw new ForbiddenException({
        code: 'WRONG_ONBOARDING_STEP',
        currentStep: user?.onboardingStep ?? null,
        requiredStep: required,
        message: await this.i18n.translate('errors.wrong_onboarding_step'),
      })
    }
    return true
  }
}
