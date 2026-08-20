import { Injectable } from '@nestjs/common'
import { LessThan, Not } from 'typeorm'
import { BusinessesRepository } from '@/modules/business/repositories/businesses.repository'
import { SubscriptionEventsRepository } from './repositories/subscription-events.repository'
import { PermissionsService } from '@/modules/permissions/permissions.service'
import { SubscriptionEventType } from '@/entities/subscription-event.entity'
import { SubscriptionStatus } from '@/entities/business.entity'
import { NotificationType, SubscriptionPlan } from '@biztrack/types'
import { Locale } from '@/common/enums/locale.enum'
import { NotificationDispatcher } from '@/modules/notifications/services/notification-dispatcher.service'

@Injectable()
export class SubscriptionsService {
  constructor(
    private businessesRepo: BusinessesRepository,
    private subscriptionEventsRepo: SubscriptionEventsRepository,
    private permissionsService: PermissionsService,
    private dispatcher: NotificationDispatcher,
  ) {}

  async expireTrials() {
    const now = new Date()
    const expired = await this.businessesRepo.find({
      where: {
        subscriptionStatus: SubscriptionStatus.TRIAL,
        trialEndsAt: LessThan(now),
        plan: Not(SubscriptionPlan.FREE),
      },
      relations: ['owner'],
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
      // BILLING is a mandatory event (always ≥1 channel) — tell the owner their trial ended.
      await this.notifyTrialEnded(business.id, business.owner?.language)
    }
  }

  /** BILLING notification when a trial ends and the business drops to Free. Fire-and-forget
   *  so a notification hiccup never blocks the downgrade. */
  private async notifyTrialEnded(businessId: string, language?: string | null): Promise<void> {
    try {
      const en = language === Locale.EN
      await this.dispatcher.dispatch({
        businessId,
        event: NotificationType.BILLING,
        title: en ? 'Your trial has ended' : 'Votre essai est terminé',
        body: en
          ? 'You’re now on the Free plan. Upgrade anytime to restore your features.'
          : 'Vous êtes maintenant sur le forfait Gratuit. Passez à un forfait supérieur à tout moment.',
        deeplink: '/settings',
        metadata: { reason: 'trial_ended' },
      })
    } catch {
      // Best-effort — the downgrade already succeeded.
    }
  }
}
