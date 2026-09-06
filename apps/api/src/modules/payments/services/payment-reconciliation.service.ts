import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Between, In, IsNull, Repository } from 'typeorm'
import {
  NotificationType,
  PaymentAttemptInitiationType,
  PaymentAttemptStatus,
} from '@biztrack/types'
import { minorToMajor } from '@biztrack/utils'
import { PaymentAttempt } from '@/entities/payment-attempt.entity'
import { Business } from '@/entities/business.entity'
import { Locale } from '@/common/enums/locale.enum'
import { NotificationDispatcher } from '@/modules/notifications/services/notification-dispatcher.service'

/**
 * Spec 07 §7.5 — reconciliation safety net for the in-store flow. In the hold-the-cart model the
 * client posts the Sale on confirmation; if that never happens (the cashier gave up, the app crashed
 * between confirm and post, or the customer approved late after the till moved on), a provider payment
 * can be CONFIRMED with `sale_id` still NULL — money collected, no sale. The state machine already
 * refuses to auto-post a late confirmation (§7.5), so these must be surfaced to a human to reconcile
 * (post the Sale or refund). This flags them to the owner; a swept attempt is windowed so it notifies
 * roughly once without needing a "notified" column.
 */
@Injectable()
export class PaymentReconciliationService {
  private readonly logger = new Logger(PaymentReconciliationService.name)

  constructor(
    @InjectRepository(PaymentAttempt)
    private readonly attempts: Repository<PaymentAttempt>,
    @InjectRepository(Business)
    private readonly businesses: Repository<Business>,
    private readonly dispatcher: NotificationDispatcher,
  ) {}

  /** Notify the owner of in-store attempts CONFIRMED with no Sale posted (money in, no sale). Only
   *  those confirmed 10–25 min ago, so a 15-min sweep flags each ~once (fresh ones may still post). */
  async notifyStrandedInStorePayments(now: number = Date.now()): Promise<number> {
    const from = new Date(now - 25 * 60_000)
    const to = new Date(now - 10 * 60_000)
    const stranded = await this.attempts.find({
      where: {
        status: PaymentAttemptStatus.CONFIRMED,
        saleId: IsNull(),
        initiationType: In([
          PaymentAttemptInitiationType.LINK,
          PaymentAttemptInitiationType.USSD_PUSH,
        ]),
        confirmedAt: Between(from, to),
      },
    })
    for (const attempt of stranded) await this.notifyOne(attempt)
    return stranded.length
  }

  private async notifyOne(attempt: PaymentAttempt): Promise<void> {
    try {
      const business = await this.businesses.findOne({
        where: { id: attempt.businessId },
        relations: ['owner'],
      })
      const en = business?.owner?.language === Locale.EN
      const value = minorToMajor(attempt.amountMinor, attempt.currency).toLocaleString(
        en ? 'en-US' : 'fr-FR',
      )
      const amount = `${value} ${attempt.currency}`
      await this.dispatcher.dispatch({
        businessId: attempt.businessId,
        event: NotificationType.TEAM_ACTIVITY,
        title: en ? 'Payment needs reconciling' : 'Paiement à réconcilier',
        body: en
          ? `A payment of ${amount} was received but no sale was recorded. Reconcile it — record the sale or refund.`
          : `Un paiement de ${amount} a été reçu mais aucune vente n'a été enregistrée. Réconciliez-le — enregistrez la vente ou remboursez.`,
        metadata: {
          attemptId: attempt.id,
          providerRef: attempt.providerRef,
          reason: 'STRANDED_IN_STORE_PAYMENT',
        },
      })
    } catch (error) {
      this.logger.warn(
        `Failed to notify stranded payment ${attempt.id}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}
