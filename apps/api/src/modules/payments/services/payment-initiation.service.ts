import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  PaymentAttemptInitiationType,
  PaymentAttemptStatus,
  type PaymentMethod,
} from '@biztrack/types'
import { PaymentAttempt } from '@/entities/payment-attempt.entity'
import { PaymentAdapterRegistry } from '../adapters/adapter.registry'
import { PaymentCredentialsService } from './payment-credentials.service'
import { PaymentRoutingService } from './payment-routing.service'

export interface InitiateOnlineCheckoutInput {
  businessId: string
  onlineOrderId: string
  method: PaymentMethod
  /** Order total in the currency's MINOR units (integer) — the form providers consume. */
  amountMinor: number
  currency: string
  /** Human reference shown on the provider side (the order number). */
  reference: string
  customerPhone?: string | null
  successUrl?: string
  cancelUrl?: string
}

export interface InitiatedPayment {
  attemptId: string
  providerRef: string
  url: string
  expiresAt: string | null
}

/** Hosted checkout links live 30 minutes (providers clamp their own floor/ceiling). */
const LINK_TTL_SECONDS = 30 * 60

/**
 * Spec 07 §6 (build 9) — start a provider payment for an online order. Resolves the routed provider,
 * creates a payment_attempt (INITIATED → PENDING) and asks the adapter for a hosted payment link
 * (Stripe Checkout Session). Returns null when the method can't be executed online — no route, no
 * adapter, or an adapter without a hosted-link flow (e.g. MTN today) — so checkout falls back to the
 * unpaid/COD path rather than failing. The webhook (§8) later confirms the attempt.
 */
@Injectable()
export class PaymentInitiationService {
  private readonly logger = new Logger(PaymentInitiationService.name)

  constructor(
    @InjectRepository(PaymentAttempt)
    private readonly attempts: Repository<PaymentAttempt>,
    private readonly routing: PaymentRoutingService,
    private readonly adapters: PaymentAdapterRegistry,
    private readonly credentials: PaymentCredentialsService,
  ) {}

  async initiateOnlineCheckout(
    input: InitiateOnlineCheckoutInput,
  ): Promise<InitiatedPayment | null> {
    const routed = await this.routing.resolveProviderForMethod(input.businessId, input.method)
    if (!routed) return null // no verified route for this method — caller uses the unpaid/COD path

    const { connection } = routed
    const adapter = this.adapters.get(connection.providerCode)
    if (!adapter?.createPaymentLink) return null // provider can't create a hosted link (e.g. MTN yet)

    const creds = await this.credentials.getDecryptedCredentials(
      input.businessId,
      connection.providerCode,
    )
    if (!creds) return null

    // Attempts are plural per order (retries → new rows). Number this one after any existing.
    const attemptNumber =
      (await this.attempts.count({ where: { onlineOrderId: input.onlineOrderId } })) + 1
    const idempotencyKey = `online_${input.onlineOrderId}_${attemptNumber}`

    const attempt = await this.attempts.save(
      this.attempts.create({
        businessId: input.businessId,
        onlineOrderId: input.onlineOrderId,
        providerId: connection.id,
        paymentMethod: input.method,
        amountMinor: input.amountMinor,
        currency: input.currency,
        status: PaymentAttemptStatus.INITIATED,
        attemptNumber,
        idempotencyKey,
        initiationType: PaymentAttemptInitiationType.ONLINE_CHECKOUT,
        customerPhone: input.customerPhone ?? null,
      }),
    )

    try {
      const link = await adapter.createPaymentLink(creds, {
        amountMinor: input.amountMinor,
        currency: input.currency,
        method: input.method,
        reference: input.reference,
        idempotencyKey,
        customerPhone: input.customerPhone ?? undefined,
        expiresInSeconds: LINK_TTL_SECONDS,
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
      })
      await this.attempts.update(attempt.id, {
        status: PaymentAttemptStatus.PENDING,
        providerRef: link.providerRef,
        linkUrl: link.url,
        expiresAt: new Date(link.expiresAt),
      })
      return {
        attemptId: attempt.id,
        providerRef: link.providerRef,
        url: link.url,
        expiresAt: link.expiresAt,
      }
    } catch (error) {
      // The link couldn't be created — fail this attempt (a retry is a new row) and let the caller
      // fall back. Never leave it dangling INITIATED.
      const reason = error instanceof Error ? error.message : String(error)
      this.logger.warn(
        `Online checkout initiation failed for order ${input.onlineOrderId}: ${reason}`,
      )
      await this.attempts.update(attempt.id, {
        status: PaymentAttemptStatus.FAILED,
        failedReason: reason,
      })
      return null
    }
  }
}
