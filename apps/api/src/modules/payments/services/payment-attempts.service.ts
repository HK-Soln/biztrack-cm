import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  PaymentAttemptStatus,
  PaymentConfirmationType,
  canTransitionPaymentAttempt,
} from '@biztrack/types'
import { PaymentAttempt } from '@/entities/payment-attempt.entity'
import { OnlineOrder } from '@/entities/online-order.entity'
import { OnlineOrderEvent } from '@/entities/online-order-event.entity'
import type { ProviderEvent } from '../adapters/payment-provider.adapter'

/**
 * Spec 07 §2.4 — the payment-attempt lifecycle. Applies provider events (webhook/poll) to an attempt
 * through the forward-only state machine: CONFIRMED/FAILED/EXPIRED are terminal, so a late or
 * duplicate event never regresses a settled attempt (idempotent no-op). Downstream truth (online
 * order status / the sale_payments ledger) is fed by build 9/10 via applyDownstreamEffects.
 */
@Injectable()
export class PaymentAttemptsService {
  private readonly logger = new Logger(PaymentAttemptsService.name)

  constructor(
    @InjectRepository(PaymentAttempt)
    private readonly attempts: Repository<PaymentAttempt>,
    @InjectRepository(OnlineOrder)
    private readonly onlineOrders: Repository<OnlineOrder>,
    @InjectRepository(OnlineOrderEvent)
    private readonly onlineOrderEvents: Repository<OnlineOrderEvent>,
  ) {}

  findByProviderRef(businessId: string, providerRef: string): Promise<PaymentAttempt | null> {
    return this.attempts.findOne({ where: { businessId, providerRef } })
  }

  /**
   * Apply a parsed provider event to its attempt. Returns the (possibly unchanged) attempt, or null
   * if the providerRef matches no attempt. Never throws on a duplicate/late event — a transition
   * that the state machine forbids is a no-op (the attempt is already terminal).
   */
  async applyProviderEvent(
    businessId: string,
    event: ProviderEvent,
    confirmationType: PaymentConfirmationType,
  ): Promise<PaymentAttempt | null> {
    const attempt = await this.findByProviderRef(businessId, event.providerRef)
    if (!attempt) {
      this.logger.warn(
        `Provider event for unknown ref ${event.providerRef} (business ${businessId})`,
      )
      return null
    }

    const to = event.status as PaymentAttemptStatus
    if (!canTransitionPaymentAttempt(attempt.status, to)) {
      // Already terminal, or an out-of-order event — never regress. Idempotent.
      return attempt
    }

    // save() (not update()) so the jsonb raw_callback is written whole, not deep-merged.
    attempt.status = to
    attempt.feeMinor = event.feeMinor ?? attempt.feeMinor
    attempt.netMinor = event.netMinor ?? attempt.netMinor
    if (to === PaymentAttemptStatus.CONFIRMED) attempt.confirmedAt = new Date()
    if (to === PaymentAttemptStatus.FAILED)
      attempt.failedReason = event.reason || 'Reported failed by provider.'
    attempt.confirmationType = confirmationType
    attempt.rawCallback = (event.raw ?? null) as Record<string, unknown> | null
    const saved = await this.attempts.save(attempt)
    await this.applyDownstreamEffects(saved)
    return saved
  }

  /**
   * Feed the sinks that own truth once an attempt settles (§2.4):
   *  - ONLINE  → online_orders.payment_status = PAID + payment_reference + a PAYMENT_GATEWAY event
   *    (build 9, below).
   *  - IN-STORE → append a sale_payments row (mobile_money_reference = provider_ref,
   *    payment_attempt_id) — TODO(build 10); attempt.sale_id is the seam.
   */
  private async applyDownstreamEffects(attempt: PaymentAttempt): Promise<void> {
    if (attempt.status !== PaymentAttemptStatus.CONFIRMED) return
    if (attempt.onlineOrderId) await this.settleOnlineOrder(attempt)
    // attempt.saleId (in-store) is handled by build 10.
  }

  /**
   * Online sink (§6.1 step 2): a confirmed gateway payment marks the order PAID and records the
   * provider ref + a customer-visible PAYMENT_GATEWAY event. The Sale itself posts later, at merchant
   * confirm (§6.1 step 3), sourcing the ref from the CONFIRMED attempt. Idempotent — a duplicate
   * webhook that already ran leaves an already-PAID order untouched.
   */
  private async settleOnlineOrder(attempt: PaymentAttempt): Promise<void> {
    const order = await this.onlineOrders.findOne({ where: { id: attempt.onlineOrderId! } })
    if (!order) {
      this.logger.warn(`Confirmed attempt ${attempt.id} references unknown online order.`)
      return
    }
    if (order.paymentStatus === 'PAID') return

    await this.onlineOrders.update(order.id, {
      paymentStatus: 'PAID',
      paymentReference: attempt.providerRef ?? order.paymentReference,
    })
    await this.onlineOrderEvents.save(
      this.onlineOrderEvents.create({
        onlineOrderId: order.id,
        businessId: order.businessId,
        eventType: 'PAYMENT_RECEIVED',
        triggeredBy: 'PAYMENT_GATEWAY',
        isCustomerVisible: true,
        customerMessage: 'Payment received.',
        trackingToken: order.trackingToken,
      }),
    )
  }
}
