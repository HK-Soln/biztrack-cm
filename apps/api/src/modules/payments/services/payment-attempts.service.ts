import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  PaymentAttemptStatus,
  PaymentConfirmationType,
  canTransitionPaymentAttempt,
} from '@biztrack/types'
import { PaymentAttempt } from '@/entities/payment-attempt.entity'
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
    if (to === PaymentAttemptStatus.FAILED) attempt.failedReason = 'Reported failed by provider.'
    attempt.confirmationType = confirmationType
    attempt.rawCallback = (event.raw ?? null) as Record<string, unknown> | null
    const saved = await this.attempts.save(attempt)
    await this.applyDownstreamEffects(saved)
    return saved
  }

  /**
   * Feed the two sinks that own truth once an attempt settles (§2.4):
   *  - ONLINE  → online_orders.payment_status + payment_reference + a PAYMENT_GATEWAY event.
   *  - IN-STORE → append a sale_payments row (mobile_money_reference = provider_ref, payment_attempt_id).
   * TODO(build 9/10): implement. Kept as a seam so the webhook path is complete and testable now.
   */
  private async applyDownstreamEffects(attempt: PaymentAttempt): Promise<void> {
    if (attempt.status !== PaymentAttemptStatus.CONFIRMED) return
    // Intentionally a no-op until online checkout (build 9) + in-store execution (build 10) wire the
    // sinks. The attempt record is already authoritative; nothing is lost by deferring the effects.
  }
}
