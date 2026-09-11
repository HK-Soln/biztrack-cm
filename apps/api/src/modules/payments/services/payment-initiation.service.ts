import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AppBadRequestException } from '@/common/exceptions/app-exceptions'
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
  PUBLIC_PROVIDER_FAILURE_REASONS,
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
  // Embedded card (Stripe Elements): the browser confirms the PaymentIntent inline with the
  // clientSecret + publishableKey; settlement still arrives via webhook + poll (Spec 09 §3).
  | {
      kind: 'elements'
      attemptId: string
      providerRef: string
      clientSecret: string
      publishableKey: string
    }

/** The storefront-facing tri-state for a payment. */
export type PublicPaymentState = 'PENDING' | 'PAID' | 'FAILED'

/** Hosted checkout links live 30 minutes (providers clamp their own floor/ceiling). */
const LINK_TTL_SECONDS = 30 * 60
/** In-store links are short — the customer is standing at the till (§7.2). */
const IN_STORE_LINK_TTL_SECONDS = 10 * 60

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

  /**
   * How a routed provider executes online — decides, at checkout, whether the storefront gets a
   * hosted redirect URL ('redirect', Stripe) or is sent to our own payment page ('self', MoMo
   * request-to-pay). 'none' when the method isn't routed/executable online (→ COD path).
   */
  async resolveOnlinePaymentMode(
    businessId: string,
    method: PaymentMethod,
  ): Promise<'redirect' | 'self' | 'none'> {
    const routed = await this.routing.resolveProviderForMethod(businessId, method)
    if (!routed) return 'none'
    const adapter = this.adapters.get(routed.connection.providerCode)
    if (!adapter) return 'none'
    if (adapter.createPaymentLink) return 'redirect'
    if (adapter.initiateUssdPush) return 'self'
    return 'none'
  }

  async initiateOnlineCheckout(
    input: InitiateOnlineCheckoutInput,
  ): Promise<InitiatedPayment | null> {
    const attempts = this.attempts
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
      (await attempts.count({ where: { onlineOrderId: input.onlineOrderId } })) + 1
    const idempotencyKey = `online_${input.onlineOrderId}_${attemptNumber}`

    const attempt = await attempts.save(
      attempts.create({
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
        await attempts.update(attempt.id, {
          status: PaymentAttemptStatus.PENDING,
          providerRef: link.providerRef,
          linkUrl: link.url,
          expiresAt: new Date(link.expiresAt),
        })
        // Poll safety net over the link's life (a webhook can be lost) — and it captures the Stripe
        // fee at settle even when the webhook (which carries none) settled it first (Build 12 §9).
        await this.queue.add(
          POLL_PAYMENT_ATTEMPT_JOB,
          {
            businessId: input.businessId,
            attemptId: attempt.id,
            deadline: Date.now() + LINK_TTL_SECONDS * 1000,
          },
          { delay: POLL_ATTEMPT_INTERVAL_MS, jobId: `poll-${attempt.id}` },
        )
        return {
          kind: 'redirect',
          attemptId: attempt.id,
          providerRef: link.providerRef,
          url: link.url,
          expiresAt: link.expiresAt,
        }
      } catch (error) {
        return this.failAttempt(attempts, attempt.id, error)
      }
    }

    // Push provider (MoMo request-to-pay): the customer approves on their phone.
    if (adapter.initiateUssdPush) {
      const phone = input.customerPhone?.trim()
      if (!phone)
        return this.failAttempt(attempts, attempt.id, new Error('A phone number is required.'))
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
        await attempts.update(attempt.id, {
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
        return this.failAttempt(attempts, attempt.id, error)
      }
    }

    // Provider has no online execution path.
    return this.failAttempt(
      attempts,
      attempt.id,
      new Error('Provider has no online payment method.'),
    )
  }

  /**
   * Spec 07 §7 (Build 10) — start a provider payment AT THE TILL for the cart being tendered. Unlike
   * the online path, NO Sale exists yet: the client holds the cart and posts the Sale on confirmation
   * (§7.2), so the attempt carries saleId=null (+ cashSessionId — the only shift link during the
   * pending window). Returns a hosted link (card) or fires the MoMo push and returns pending; null when
   * the method isn't routed to an executable provider. Idempotent on clientReference (double-submit
   * safe → returns the existing attempt).
   */
  async initiateInStorePayment(input: {
    businessId: string
    method: PaymentMethod
    amountMinor: number
    currency: string
    reference: string
    customerPhone?: string | null
    cashSessionId?: string | null
    clientReference: string
  }): Promise<InitiatedPayment | null> {
    const idempotencyKey = `instore_${input.clientReference}`
    const existing = await this.attempts.findOne({
      where: { businessId: input.businessId, idempotencyKey },
    })
    if (existing) return this.describeAttempt(existing)

    const routed = await this.routing.resolveProviderForMethod(input.businessId, input.method)
    if (!routed) return null
    const { connection } = routed
    const adapter = this.adapters.get(connection.providerCode)
    if (!adapter) return null
    const creds = await this.credentials.getDecryptedCredentials(
      input.businessId,
      connection.providerCode,
    )
    if (!creds) return null

    const attempt = await this.attempts.save(
      this.attempts.create({
        businessId: input.businessId,
        saleId: null,
        cashSessionId: input.cashSessionId ?? null,
        providerId: connection.id,
        paymentMethod: input.method,
        amountMinor: input.amountMinor,
        currency: input.currency,
        status: PaymentAttemptStatus.INITIATED,
        attemptNumber: 1,
        idempotencyKey,
        initiationType: adapter.createPaymentLink
          ? PaymentAttemptInitiationType.LINK
          : PaymentAttemptInitiationType.USSD_PUSH,
        customerPhone: input.customerPhone ?? null,
      }),
    )

    // Hosted-link provider (card): the customer pays via the link/QR shown at the till. Stripe requires
    // success/cancel URLs even though the till settles via WS/poll — the redirect is only where the
    // customer's phone lands after paying.
    if (adapter.createPaymentLink) {
      const returnUrl = this.inStoreReturnUrl()
      try {
        const link = await adapter.createPaymentLink(creds, {
          amountMinor: input.amountMinor,
          currency: input.currency,
          method: input.method,
          reference: input.reference,
          idempotencyKey,
          customerPhone: input.customerPhone ?? undefined,
          expiresInSeconds: IN_STORE_LINK_TTL_SECONDS,
          successUrl: returnUrl,
          cancelUrl: returnUrl,
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
        return this.failInStore(
          attempt.id,
          error,
          'PAYMENT_INITIATION_FAILED',
          'We could not start the card payment. Please try again.',
        )
      }
    }

    // Push provider (MoMo request-to-pay): the customer approves on their phone.
    if (adapter.initiateUssdPush) {
      const phone = input.customerPhone?.trim()
      if (!phone)
        return this.failInStore(
          attempt.id,
          new Error('A phone number is required.'),
          'PHONE_REQUIRED',
          'A Mobile Money number is required.',
        )
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
        return this.failInStore(
          attempt.id,
          error,
          'PAYMENT_INITIATION_FAILED',
          'We could not start the Mobile Money payment. Please try again.',
        )
      }
    }

    return this.failInStore(
      attempt.id,
      new Error('Provider has no in-store payment method.'),
      'PAYMENT_METHOD_NOT_ROUTABLE',
      'This provider cannot be charged in store.',
    )
  }

  /**
   * Spec 08 §6.2 — start a provider payment for a PAYMENT LINK (pays an arbitrary payable). Sibling of
   * initiateInStorePayment: the attempt carries paymentLinkId (its settle sink applies the payment to
   * the payable). Card → hosted link (redirect to Stripe); MoMo → request-to-pay push + poll. Idempotent
   * on clientReference. `returnUrl` is where the payer's phone lands after a hosted card payment (the
   * public pay page); settlement still runs via WS/poll.
   */
  async initiateLinkPayment(input: {
    businessId: string
    paymentLinkId: string
    method: PaymentMethod
    amountMinor: number
    currency: string
    reference: string
    customerPhone?: string | null
    clientReference: string
    returnUrl?: string
  }): Promise<InitiatedPayment | null> {
    const idempotencyKey = `link_${input.clientReference}`
    const existing = await this.attempts.findOne({
      where: { businessId: input.businessId, idempotencyKey },
    })
    if (existing) return this.describeAttempt(existing)

    const routed = await this.routing.resolveProviderForMethod(input.businessId, input.method)
    if (!routed) return null
    const { connection } = routed
    const adapter = this.adapters.get(connection.providerCode)
    if (!adapter) return null
    const creds = await this.credentials.getDecryptedCredentials(
      input.businessId,
      connection.providerCode,
    )
    if (!creds) return null

    const attemptNumber =
      (await this.attempts.count({ where: { paymentLinkId: input.paymentLinkId } })) + 1
    const attempt = await this.attempts.save(
      this.attempts.create({
        businessId: input.businessId,
        paymentLinkId: input.paymentLinkId,
        providerId: connection.id,
        paymentMethod: input.method,
        amountMinor: input.amountMinor,
        currency: input.currency,
        status: PaymentAttemptStatus.INITIATED,
        attemptNumber,
        idempotencyKey,
        initiationType: adapter.createPaymentLink
          ? PaymentAttemptInitiationType.LINK
          : PaymentAttemptInitiationType.USSD_PUSH,
        customerPhone: input.customerPhone ?? null,
      }),
    )

    // Embedded card (Stripe Elements) — the payer confirms inline on the pay page, no redirect
    // (Spec 09 §3). Preferred over the hosted link when the provider supports it.
    if (adapter.createPaymentIntent) {
      try {
        const intent = await adapter.createPaymentIntent(creds, {
          amountMinor: input.amountMinor,
          currency: input.currency,
          idempotencyKey,
          reference: input.reference,
        })
        await this.attempts.update(attempt.id, {
          status: PaymentAttemptStatus.PENDING,
          providerRef: intent.providerRef,
        })
        // Poll safety net + Stripe fee capture at settle (§9).
        await this.queue.add(
          POLL_PAYMENT_ATTEMPT_JOB,
          {
            businessId: input.businessId,
            attemptId: attempt.id,
            deadline: Date.now() + LINK_TTL_SECONDS * 1000,
          },
          { delay: POLL_ATTEMPT_INTERVAL_MS, jobId: `poll-${attempt.id}` },
        )
        return {
          kind: 'elements',
          attemptId: attempt.id,
          providerRef: intent.providerRef,
          clientSecret: intent.clientSecret,
          publishableKey: creds.publishable_key?.trim() ?? '',
        }
      } catch (error) {
        return this.failInStore(
          attempt.id,
          error,
          'PAYMENT_INITIATION_FAILED',
          'We could not start the card payment. Please try again.',
        )
      }
    }

    if (adapter.createPaymentLink) {
      const returnUrl = input.returnUrl || this.inStoreReturnUrl()
      try {
        const link = await adapter.createPaymentLink(creds, {
          amountMinor: input.amountMinor,
          currency: input.currency,
          method: input.method,
          reference: input.reference,
          idempotencyKey,
          customerPhone: input.customerPhone ?? undefined,
          expiresInSeconds: LINK_TTL_SECONDS,
          successUrl: returnUrl,
          cancelUrl: returnUrl,
        })
        await this.attempts.update(attempt.id, {
          status: PaymentAttemptStatus.PENDING,
          providerRef: link.providerRef,
          linkUrl: link.url,
          expiresAt: new Date(link.expiresAt),
        })
        // Poll safety net + Stripe fee capture at settle (§9).
        await this.queue.add(
          POLL_PAYMENT_ATTEMPT_JOB,
          {
            businessId: input.businessId,
            attemptId: attempt.id,
            deadline: Date.now() + LINK_TTL_SECONDS * 1000,
          },
          { delay: POLL_ATTEMPT_INTERVAL_MS, jobId: `poll-${attempt.id}` },
        )
        return {
          kind: 'redirect',
          attemptId: attempt.id,
          providerRef: link.providerRef,
          url: link.url,
          expiresAt: link.expiresAt,
        }
      } catch (error) {
        return this.failInStore(
          attempt.id,
          error,
          'PAYMENT_INITIATION_FAILED',
          'We could not start the card payment. Please try again.',
        )
      }
    }

    if (adapter.initiateUssdPush) {
      const phone = input.customerPhone?.trim()
      if (!phone)
        return this.failInStore(
          attempt.id,
          new Error('A phone number is required.'),
          'PHONE_REQUIRED',
          'A Mobile Money number is required.',
        )
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
        return this.failInStore(
          attempt.id,
          error,
          'PAYMENT_INITIATION_FAILED',
          'We could not start the Mobile Money payment. Please try again.',
        )
      }
    }

    return this.failInStore(
      attempt.id,
      new Error('Provider has no payment method.'),
      'PAYMENT_METHOD_NOT_ROUTABLE',
      'This provider cannot be charged.',
    )
  }

  /** Poll the latest attempt for a payment link → tri-state + reason + providerRef + amount (which the
   *  settlement sink applies to the payable). */
  async getLinkPaymentStatus(
    businessId: string,
    paymentLinkId: string,
  ): Promise<{ status: PublicPaymentState; reason?: string; providerRef?: string } | null> {
    const attempt = await this.attempts.findOne({
      where: { businessId, paymentLinkId },
      order: { createdAt: 'DESC' },
    })
    if (!attempt) return null
    const settled = await this.reconcileAttempt(attempt)
    const status = this.toPublicState(settled.status)
    const reason =
      status === 'FAILED' &&
      settled.failedReason &&
      PUBLIC_PROVIDER_FAILURE_REASONS.has(settled.failedReason)
        ? settled.failedReason
        : undefined
    return { status, reason, providerRef: settled.providerRef ?? undefined }
  }

  /** A generic return URL for in-store hosted links — Stripe requires success/cancel URLs, but the
   *  till settles via WebSocket/poll, so this is only where the customer's phone lands after paying.
   *  Configurable via IN_STORE_PAYMENT_RETURN_URL; falls back to the API origin. */
  private inStoreReturnUrl(): string | undefined {
    const configured = this.config.get<string>('IN_STORE_PAYMENT_RETURN_URL')?.trim()
    if (configured) return configured
    const apiOrigin = (this.config.get<string>('API_URL') ?? '').replace(/\/+$/, '')
    return apiOrigin || undefined
  }

  /** In-store initiation error: mark the attempt FAILED, then surface a CLEAR client error (distinct
   *  from "no route" — the route exists, the provider call failed). Never leaks provider internals. */
  private async failInStore(
    attemptId: string,
    error: unknown,
    code: string,
    message: string,
  ): Promise<never> {
    await this.failAttempt(this.attempts, attemptId, error)
    throw new AppBadRequestException(message, code)
  }

  /** Map an already-created attempt back to the initiation shape (idempotent re-submit). */
  private describeAttempt(attempt: PaymentAttempt): InitiatedPayment | null {
    if (!attempt.providerRef) return null
    if (attempt.linkUrl)
      return {
        kind: 'redirect',
        attemptId: attempt.id,
        providerRef: attempt.providerRef,
        url: attempt.linkUrl,
        expiresAt: attempt.expiresAt ? attempt.expiresAt.toISOString() : null,
      }
    return { kind: 'pending', attemptId: attempt.id, providerRef: attempt.providerRef }
  }

  /** Poll an in-store attempt (authed till): reconcile + return tri-state, reason, and providerRef
   *  (which the client stores on the Sale's payment line when it posts on PAID). */
  async getInStorePaymentStatus(
    businessId: string,
    attemptId: string,
  ): Promise<{ status: PublicPaymentState; reason?: string; providerRef?: string } | null> {
    const attempt = await this.attempts.findOne({ where: { businessId, id: attemptId } })
    if (!attempt) return null
    const settled = await this.reconcileAttempt(attempt)
    const status = this.toPublicState(settled.status)
    const reason =
      status === 'FAILED' &&
      settled.failedReason &&
      PUBLIC_PROVIDER_FAILURE_REASONS.has(settled.failedReason)
        ? settled.failedReason
        : undefined
    return { status, reason, providerRef: settled.providerRef ?? undefined }
  }

  /**
   * Spec 07 §7.6 — a manager overrides a PENDING in-store attempt: hard-confirm (the payment landed but
   * wasn't auto-detected — avoids a double charge) or mark it failed. Recorded as MANUAL with
   * confirmedBy, and it flows through the same state machine → emits the settle to the till.
   */
  async manualSettleInStore(
    businessId: string,
    attemptId: string,
    action: 'confirm' | 'fail',
    actorUserId: string,
  ): Promise<{ status: PublicPaymentState; providerRef?: string } | null> {
    const attempt = await this.attempts.findOne({ where: { businessId, id: attemptId } })
    if (!attempt) return null
    const isInStore =
      attempt.initiationType === PaymentAttemptInitiationType.LINK ||
      attempt.initiationType === PaymentAttemptInitiationType.USSD_PUSH
    if (!isInStore || !attempt.providerRef) return null
    // Idempotent: already terminal → return its state, no transition.
    if (PAYMENT_ATTEMPT_TERMINAL.includes(attempt.status))
      return { status: this.toPublicState(attempt.status), providerRef: attempt.providerRef }
    const to = action === 'confirm' ? PaymentAttemptStatus.CONFIRMED : PaymentAttemptStatus.FAILED
    const updated = await this.attemptsService.applyProviderEvent(
      attempt.businessId,
      {
        providerRef: attempt.providerRef,
        status: to,
        eventId: `manual-${attemptId}`,
        reason: action === 'fail' ? 'MANUAL' : undefined,
        raw: { manual: true },
      },
      PaymentConfirmationType.MANUAL,
      action === 'confirm' ? actorUserId : undefined,
    )
    const settled = updated ?? attempt
    return {
      status: this.toPublicState(settled.status),
      providerRef: settled.providerRef ?? undefined,
    }
  }

  private async failAttempt(
    attempts: Repository<PaymentAttempt>,
    attemptId: string,
    error: unknown,
  ): Promise<null> {
    const reason = error instanceof Error ? error.message : String(error)
    this.logger.warn(`Payment initiation failed for attempt ${attemptId}: ${reason}`)
    await attempts.update(attemptId, {
      status: PaymentAttemptStatus.FAILED,
      failedReason: reason,
    })
    return null
  }

  /** The public URL MoMo PUTs its callback to — our signed connection token + the reference in the
   * path (MoMo has no HMAC, so the path token is the authentication).
   *
   * OPT-IN: MoMo validates the callback host against the `providerCallbackHost` on the API user and
   * rejects the whole request-to-pay (INVALID_CALLBACK_URL_HOST) if it doesn't match — and it can
   * never reach a localhost dev API. So we only send it when MTN_MOMO_CALLBACK_ENABLED=true (i.e. a
   * public API whose host the merchant registered as their callback host). Otherwise the background
   * poll job is the sole — and reliable — settle path. */
  private momoCallbackUrl(webhookToken: string | null, referenceId: string): string | undefined {
    if (this.config.get<string>('MTN_MOMO_CALLBACK_ENABLED') !== 'true') return undefined
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
    if (!attempt.providerRef) return attempt
    const isTerminal = PAYMENT_ATTEMPT_TERMINAL.includes(attempt.status)
    // A settled attempt is done UNLESS it's a CONFIRMED payment whose fee we never captured (e.g. a
    // webhook settled it before any poll — Build 12 §9: capture fees now, unrecoverable later).
    const needsFees = attempt.status === PaymentAttemptStatus.CONFIRMED && attempt.feeMinor == null
    if (isTerminal && !needsFees) return attempt
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
      if (isTerminal) {
        // Fee-only capture — NEVER re-transition a settled attempt.
        if (state.feeMinor != null) {
          await this.attempts.update(attempt.id, {
            feeMinor: state.feeMinor,
            netMinor: state.netMinor ?? null,
          })
          attempt.feeMinor = state.feeMinor
          attempt.netMinor = state.netMinor ?? null
        }
        return attempt
      }
      const updated = await this.attemptsService.applyProviderEvent(
        attempt.businessId,
        {
          providerRef: attempt.providerRef,
          status: state.status,
          eventId: '',
          reason: state.reason,
          feeMinor: state.feeMinor,
          netMinor: state.netMinor,
          raw: state.raw,
        },
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

  /** The storefront payment page polls this: reconcile the order's latest attempt, return a tri-state
   *  plus (on FAILED) the provider's whitelisted reason code so the page can explain what went wrong. */
  async pollOnlineOrderPayment(
    businessId: string,
    onlineOrderId: string,
  ): Promise<{ status: PublicPaymentState; reason?: string } | null> {
    const attempt = await this.attempts.findOne({
      where: { businessId, onlineOrderId, deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
    })
    if (!attempt) return null
    const settled = await this.reconcileAttempt(attempt)
    const status = this.toPublicState(settled.status)
    const reason =
      status === 'FAILED' &&
      settled.failedReason &&
      PUBLIC_PROVIDER_FAILURE_REASONS.has(settled.failedReason)
        ? settled.failedReason
        : undefined
    return { status, reason }
  }

  private toPublicState(status: PaymentAttemptStatus): PublicPaymentState {
    if (status === PaymentAttemptStatus.CONFIRMED) return 'PAID'
    if (status === PaymentAttemptStatus.FAILED || status === PaymentAttemptStatus.EXPIRED)
      return 'FAILED'
    return 'PENDING'
  }
}
