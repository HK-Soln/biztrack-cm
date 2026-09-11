import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  BusinessMemberRole,
  NotificationType,
  PayableType,
  PaymentAttemptStatus,
  PaymentLinkStatus,
  type JwtPayload,
} from '@biztrack/types'
import { minorToMajor } from '@biztrack/utils'
import type { Logger } from '@biztrack/logger'
import { LOGGER } from '@/logger/logger.module'
import { PaymentLink } from '@/entities/payment-link.entity'
import { PaymentAttempt } from '@/entities/payment-attempt.entity'
import { Business } from '@/entities/business.entity'
import { Locale } from '@/common/enums/locale.enum'
import { NotificationDispatcher } from '@/modules/notifications/services/notification-dispatcher.service'
import { RealtimeService } from '@/modules/realtime/services/realtime.service'
import { SalesService } from '@/modules/sales/services/sales.service'
import type { CreateSaleDto } from '@/modules/sales/dto/create-sale.dto'
import { PayableHandlerRegistry } from './payable-handlers'

/**
 * Spec 08 §7 — settlement sink for a CONFIRMED payment-link attempt. Resolves the handler, applies the
 * payment to the payable (record sale/debt payment · mark order paid · credit deposit), advances the
 * link's amount_paid/status, and notifies the merchant. Looked up lazily by PaymentAttemptsService via
 * ModuleRef (PaymentLinks imports Payments, so this can't be a direct dependency). Idempotent: the
 * attempt state machine confirms once, and an already-recorded link amount guards a double-apply.
 */
@Injectable()
export class PaymentLinkSettlementService {
  constructor(
    @InjectRepository(PaymentLink)
    private readonly links: Repository<PaymentLink>,
    @InjectRepository(Business)
    private readonly businesses: Repository<Business>,
    @InjectRepository(PaymentAttempt)
    private readonly attempts: Repository<PaymentAttempt>,
    private readonly registry: PayableHandlerRegistry,
    private readonly dispatcher: NotificationDispatcher,
    private readonly realtime: RealtimeService,
    private readonly sales: SalesService,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    this.logger.setContext('PaymentLinkSettlementService')
  }

  /** Apply a settled attempt to its link's payable. Only CONFIRMED attempts do work; a FAILED attempt
   *  leaves the link payable for a retry (nothing to undo — no Sale/payment was written on failure).
   *  Called ONCE per attempt: the state machine transitions PENDING→CONFIRMED a single time, and a
   *  re-delivered event on a terminal attempt is a no-op that never reaches here (idempotent by design). */
  async settle(attempt: PaymentAttempt): Promise<void> {
    if (!attempt.paymentLinkId || attempt.status !== 'CONFIRMED') return
    const link = await this.links.findOne({ where: { id: attempt.paymentLinkId } })
    if (!link || link.status === PaymentLinkStatus.PAID) return

    const newPaid = Number(link.amountPaidMinor) + Number(attempt.amountMinor)

    // SALE_DRAFT (Spec 09): no external payable — accumulate toward the expected total, and once fully
    // collected materialize the REAL sale with its true tender (the confirmed attempts' methods). The
    // sale is created server-side and syncs to the till; a walk-in stays anonymous, no credit sale.
    if (link.payableType === PayableType.SALE_DRAFT) {
      const fullyPaid = newPaid >= Number(link.amountMinor)
      if (fullyPaid && !link.saleId) {
        try {
          await this.materializeSaleDraft(link, attempt)
        } catch (error) {
          this.logger.error('SALE_DRAFT materialization failed', 'PaymentLinkSettlementService', {
            linkId: link.id,
            attemptId: attempt.id,
            error: error instanceof Error ? error.message : String(error),
          })
          // Leave the link un-advanced (money captured on the attempt) for a human to reconcile.
          return
        }
      }
      const status = fullyPaid ? PaymentLinkStatus.PAID : PaymentLinkStatus.PARTIALLY_PAID
      await this.links.update(link.id, { amountPaidMinor: newPaid, status })
      this.emit(link, status, newPaid, Number(attempt.amountMinor))
      void this.notifyMerchant(link.businessId, link.label, Number(attempt.amountMinor), link.currency)
      return
    }

    const handler = this.registry.get(link.payableType)
    if (!handler) {
      this.logger.warn(`No handler for payable ${link.payableType} (link ${link.id})`)
      return
    }

    try {
      await handler.applyPayment(link.businessId, link.payableId, {
        amountMinor: Number(attempt.amountMinor),
        method: attempt.paymentMethod,
        providerRef: attempt.providerRef,
        actorUserId: link.createdBy,
      })
    } catch (error) {
      this.logger.error('Payment-link settlement failed', 'PaymentLinkSettlementService', {
        linkId: link.id,
        attemptId: attempt.id,
        error: error instanceof Error ? error.message : String(error),
      })
      return // leave the link un-advanced; a human reconciles (the money is captured on the attempt)
    }

    // Advance the link. amount_paid accumulates; status becomes PAID when the payable is cleared (the
    // handler's next resolve returns 0 due), else PARTIALLY_PAID.
    const stillDue = (await handler.resolve(link.businessId, link.payableId))?.amountDueMinor ?? 0
    const status =
      link.payableType === 'DEPOSIT' || stillDue <= 0
        ? PaymentLinkStatus.PAID
        : PaymentLinkStatus.PARTIALLY_PAID
    await this.links.update(link.id, { amountPaidMinor: newPaid, status })
    this.emit(link, status, newPaid, Number(attempt.amountMinor))
    void this.notifyMerchant(link.businessId, link.label, Number(attempt.amountMinor), link.currency)
  }

  /** Live-push settlement to the merchant's business channel so offline-first desktop screens refresh
   *  without a hard reload (Spec 08/09). */
  private emit(
    link: PaymentLink,
    status: PaymentLinkStatus,
    amountPaidMinor: number,
    paidNowMinor: number,
  ): void {
    this.realtime.toBusiness(link.businessId, 'payment.link', {
      paymentLinkId: link.id,
      businessId: link.businessId,
      payableType: link.payableType,
      payableId: link.payableId,
      status: status === PaymentLinkStatus.PAID ? 'PAID' : 'PARTIALLY_PAID',
      amountPaidMinor,
      amountMinor: Number(link.amountMinor),
      paidNowMinor,
    })
  }

  /** Create the real POS sale a SALE_DRAFT link stood for, with its ACTUAL tender (the confirmed
   *  attempts' methods), and record the sale id on the link. Runs once (guarded by link.saleId). */
  private async materializeSaleDraft(link: PaymentLink, current: PaymentAttempt): Promise<void> {
    const draft = (link.draftPayload ?? {}) as Record<string, unknown>
    // Build the sale's payment lines from the confirmed attempts on this link — the true tenders. Merge
    // in the just-confirmed `current` attempt explicitly: a separate query can miss it (it may not be
    // visible yet), and if the lines came back empty the sale would post as an anonymous CREDIT sale.
    const found = await this.attempts.find({
      where: { paymentLinkId: link.id, status: PaymentAttemptStatus.CONFIRMED },
    })
    const byId = new Map(found.map((a) => [a.id, a]))
    byId.set(current.id, current)
    const payments = [...byId.values()].map((a) => ({
      method: a.paymentMethod,
      amount: minorToMajor(Number(a.amountMinor), link.currency),
      mobileMoneyReference: a.providerRef ?? null,
    }))
    if (payments.length === 0) {
      throw new Error('No confirmed attempts to build the sale payments from.')
    }
    const dto = { ...draft, payments } as unknown as CreateSaleDto
    const actor = {
      sub: link.createdBy ?? '',
      businessId: link.businessId,
      role: BusinessMemberRole.OWNER,
    } as JwtPayload
    const sale = await this.sales.create(link.businessId, actor, dto)
    await this.links.update(link.id, { saleId: sale.id })
  }

  private async notifyMerchant(
    businessId: string,
    label: string | null,
    amountMinor: number,
    currency: string,
  ): Promise<void> {
    try {
      const business = await this.businesses.findOne({
        where: { id: businessId },
        relations: ['owner'],
      })
      const en = business?.owner?.language === Locale.EN
      const value = `${minorToMajor(amountMinor, currency).toLocaleString(en ? 'en-US' : 'fr-FR')} ${currency}`
      await this.dispatcher.dispatch({
        businessId,
        event: NotificationType.PAYMENT_RECEIVED,
        title: en ? 'Payment link paid' : 'Lien de paiement payé',
        body: en
          ? `${value} received for ${label ?? 'a payment link'}.`
          : `${value} reçu pour ${label ?? 'un lien de paiement'}.`,
        metadata: { reason: 'PAYMENT_LINK_PAID', amountMinor },
      })
    } catch (error) {
      this.logger.warn('Failed to notify payment-link payment', 'PaymentLinkSettlementService', {
        businessId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}
