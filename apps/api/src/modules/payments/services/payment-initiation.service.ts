import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectQueue } from '@nestjs/bullmq'
import { InjectRepository } from '@nestjs/typeorm'
import { randomUUID } from 'node:crypto'
import { Queue } from 'bullmq'
import { IsNull, Repository } from 'typeorm'
import {
  PAYMENT_ATTEMPT_TERMINAL,
  PaymentAttemptInitiationType,
  PaymentAttemptStatus,
  PaymentConfirmationType,
  type PaymentMethod,
} from '@biztrack/types'
import { PaymentAttempt } from '@/entities/payment-attempt.entity'
import { BusinessPaymentProvider } from '@/entities/business-payment-provider.entity'
import { PaymentAdapterRegistry } from '../adapters/adapter.registry'
import { PaymentCredentialsService } from './payment-credentials.service'
import { PaymentRoutingService } from './payment-routing.service'
import { PaymentAttemptsService } from './payment-attempts.service'
import {
  PAYMENTS_QUEUE,
  POLL_ATTEMPT_INTERVAL_MS,
  POLL_ATTEMPT_WINDOW_MS,
  POLL_PAYMENT_ATTEMPT_JOB,
} from '../payments.constants'

export interface InitiateOnlineCheckoutInput {
  businessId: string
  onlineOrderId: string
  method: PaymentMethod
  /** Order total in the currency's MINOR units (integer). */
  amountMinor: number
  currency: string
  /** Human reference shown on the provider side (the order number). */
  reference: string
  customerPhone?: string | null
  successUrl?: string
  cancelUrl?: string
}

/** Either a hosted redirect (Stripe Checkout) or a push the customer approves on their phone (MoMo). */
export type InitiatedPayment =
  | {
      kind: 'redirect'
      attemptId: string
      providerRef: string
      url: string
      expiresAt: string | null
    }
  | { kind: 'pending'; attemptId: string; providerRef: string }

/** The storefront-facing tri-state for a payment. */
export type PublicPaymentState = 'PENDING' | 'PAID' | 'FAILED'

/** Hosted checkout links live 30 minutes (providers clamp their own floor/ceiling). */
const LINK_TTL_SECONDS = 30 * 60

/**
 * Spec 07 §6 — start and reconcile a provider payment for an online order.
 *
 * initiateOnlineCheckout resolves the routed provider and creates a payment_attempt, then either asks
 * the adapter for a hosted link (Stripe → redirect) or fires a request-to-pay push (MoMo → the
 * customer approves on their phone). Returns null when the method can't be executed online, so
 * checkout falls back to the unpaid/COD path.
 *
 * pollOnlineOrderPayment reconciles the latest attempt against the provider (getTransaction) and
 * applies the terminal result — this is what the storefront wait screen polls, and what the
 * background reconcile job will reuse.
 */
@Injectable()
export class PaymentInitiationService {
  private readonly logger = new Logger(PaymentInitiationService.name)

  constructor(
    @InjectRepository(PaymentAttempt)
    private readonly attempts: Repository<PaymentAttempt>,
    @InjectRepository(BusinessPaymentProvider)
    private readonly connections: Repository<BusinessPaymentProvider>,
    private readonly routing: PaymentRoutingService,
    private readonly adapters: PaymentAdapterRegistry,
    private readonly credentials: PaymentCredentialsService,
    private readonly attemptsService: PaymentAttemptsService,
    private readonly config: ConfigService,
    @InjectQueue(PAYMENTS_QUEUE) private readonly queue: Queue,
  ) {}

  async initiateOnlineCheckout(
    input: InitiateOnlineCheckoutInput,
  ): Promise<InitiatedPayment | null> {
    const routed = await this.routing.resolveProviderForMethod(input.businessId, input.method)
    if (!routed) return null // no verified route — caller uses the unpaid/COD path

    const { connection } = routed
    const adapter = this.adapters.get(connection.providerCode)
    if (!adapter) return null
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

    // Hosted-link provider (Stripe): redirect the customer to a hosted page.
    if (adapter.createPaymentLink) {
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
          kind: 'redirect',
          attemptId: attempt.id,
          providerRef: link.providerRef,
          url: link.url,
          expiresAt: link.expiresAt,
        }
      } catch (error) {
        return this.failAttempt(attempt.id, error)
      }
    }

    // Push provider (MoMo request-to-pay): the customer approves on their phone.
    if (adapter.initiateUssdPush) {
      const phone = input.customerPhone?.trim()
      if (!phone) return this.failAttempt(attempt.id, new Error('A phone number is required.'))
      // Generate the reference up front so it's the provider ref AND the callback path segment.
      const referenceId = randomUUID()
      const callbackUrl = this.momoCallbackUrl(connection.webhookToken, referenceId)
      try {
        const push = await adapter.initiateUssdPush(creds, {
          amountMinor: input.amountMinor,
          currency: input.currency,
          method: input.method,
          customerPhone: phone,
          reference: input.reference,
          idempotencyKey,
          referenceId,
          callbackUrl,
        })
        await this.attempts.update(attempt.id, {
          status: PaymentAttemptStatus.PENDING,
          providerRef: push.providerRef,
        })
        // Background reconcile safety net (the callback is single-shot / may never arrive).
        await this.queue.add(
          POLL_PAYMENT_ATTEMPT_JOB,
          {
            businessId: input.businessId,
            attemptId: attempt.id,
            deadline: Date.now() + POLL_ATTEMPT_WINDOW_MS,
          },
          { delay: POLL_ATTEMPT_INTERVAL_MS, jobId: `poll-${attempt.id}` },
        )
        return { kind: 'pending', attemptId: attempt.id, providerRef: push.providerRef }
      } catch (error) {
        return this.failAttempt(attempt.id, error)
      }
    }

    // Provider has no online execution path.
    return this.failAttempt(attempt.id, new Error('Provider has no online payment method.'))
  }

  private async failAttempt(attemptId: string, error: unknown): Promise<null> {
    const reason = error instanceof Error ? error.message : String(error)
    this.logger.warn(`Online checkout initiation failed for attempt ${attemptId}: ${reason}`)
    await this.attempts.update(attemptId, {
      status: PaymentAttemptStatus.FAILED,
      failedReason: reason,
    })
    return null
  }

  /** The public URL MoMo PUTs its callback to — our signed connection token + the reference in the
   * path (MoMo has no HMAC, so the path token is the authentication). Null when no token/API_URL. */
  private momoCallbackUrl(webhookToken: string | null, referenceId: string): string | undefined {
    const base = (this.config.get<string>('API_URL') ?? '').replace(/\/+$/, '')
    if (!webhookToken || !base) return undefined
    return `${base}/api/v1/webhooks/payments/momo/${webhookToken}/${referenceId}`
  }

  /** Callback entry point: a provider callback is only a trigger, so reconcile authoritative status. */
  async reconcileByRef(businessId: string, providerRef: string): Promise<void> {
    const attempt = await this.attempts.findOne({ where: { businessId, providerRef } })
    if (attempt) await this.reconcileAttempt(attempt)
  }

  /**
   * Reconcile one non-terminal attempt against the provider and apply the terminal result. Used by
   * the storefront status poll and (later) the background reconcile job. Returns the (possibly
   * updated) attempt; on any provider error it returns the attempt unchanged (a later poll retries).
   */
  async reconcileAttempt(attempt: PaymentAttempt): Promise<PaymentAttempt> {
    if (PAYMENT_ATTEMPT_TERMINAL.includes(attempt.status) || !attempt.providerRef) return attempt
    const connection = await this.connections.findOne({ where: { id: attempt.providerId } })
    const adapter = connection ? this.adapters.get(connection.providerCode) : null
    if (!connection || !adapter?.getTransaction) return attempt
    const creds = await this.credentials.getDecryptedCredentials(
      attempt.businessId,
      connection.providerCode,
    )
    if (!creds) return attempt
    try {
      const state = await adapter.getTransaction(creds, attempt.providerRef)
      const updated = await this.attemptsService.applyProviderEvent(
        attempt.businessId,
        { providerRef: attempt.providerRef, status: state.status, eventId: '', raw: state.raw },
        PaymentConfirmationType.POLL,
      )
      return updated ?? attempt
    } catch (error) {
      this.logger.warn(
        `Reconcile failed for attempt ${attempt.id}: ${error instanceof Error ? error.message : String(error)}`,
      )
      return attempt
    }
  }

  /** The storefront wait screen polls this: reconcile the order's latest attempt, return a tri-state. */
  async pollOnlineOrderPayment(
    businessId: string,
    onlineOrderId: string,
  ): Promise<PublicPaymentState | null> {
    const attempt = await this.attempts.findOne({
      where: { businessId, onlineOrderId, deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
    })
    if (!attempt) return null
    const settled = await this.reconcileAttempt(attempt)
    return this.toPublicState(settled.status)
  }

  private toPublicState(status: PaymentAttemptStatus): PublicPaymentState {
    if (status === PaymentAttemptStatus.CONFIRMED) return 'PAID'
    if (status === PaymentAttemptStatus.FAILED || status === PaymentAttemptStatus.EXPIRED)
      return 'FAILED'
    return 'PENDING'
  }
}
