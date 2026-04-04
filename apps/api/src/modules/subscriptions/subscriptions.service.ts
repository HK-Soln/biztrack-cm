import { Injectable } from '@nestjs/common'
import { BusinessesRepository } from '@/modules/business/repositories/businesses.repository'
import { SubscriptionEventsRepository } from './repositories/subscription-events.repository'
import { PermissionsService } from '@/modules/permissions/permissions.service'
import { SubscriptionEventType } from '@/entities/subscription-event.entity'
import { SubscriptionStatus } from '@/entities/business.entity'
import { SubscriptionPlan } from '@biztrack/types'

@Injectable()
export class SubscriptionsService {
  constructor(
    private businessesRepo: BusinessesRepository,
    private subscriptionEventsRepo: SubscriptionEventsRepository,
    private permissionsService: PermissionsService,
  ) {}

  async expireTrials() {
    const now = new Date()
    const expired = await this.businessesRepo.find({
      where: {
        subscriptionStatus: SubscriptionStatus.TRIAL,
        trialEndsAt: { lt: now } as any,
        plan: { not: SubscriptionPlan.FREE } as any,
      } as any,
    })

    for (const business of expired) {
      await this.businessesRepo.update(business.id, {
        plan: SubscriptionPlan.FREE,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
      })
      await this.permissionsService.invalidateCache(business.id)
      await this.subscriptionEventsRepo.createOne({
        businessId: business.id,
        event: SubscriptionEventType.TRIAL_ENDED,
        fromPlan: business.plan,
        toPlan: SubscriptionPlan.FREE,
      })
    }
  }
}
