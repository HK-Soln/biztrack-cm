import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  PayableType,
  PaymentLinkStatus,
  PaymentMethod,
  ROUTABLE_PAYMENT_METHODS,
  type InitiatePaymentLinkRequest,
  type InitiatePaymentLinkResult,
  type PaymentLinkPaymentStatus,
  type PublicPaymentLink,
} from '@biztrack/types'
import { AppBadRequestException, AppNotFoundException } from '@/common/exceptions/app-exceptions'
import { PaymentLink } from '@/entities/payment-link.entity'
import { Business } from '@/entities/business.entity'
import { PaymentInitiationService } from '@/modules/payments/services/payment-initiation.service'
import { PaymentRoutingService } from '@/modules/payments/services/payment-routing.service'
import { PayableHandlerRegistry } from './payable-handlers'

/**
 * Spec 08 §6.2 — the public (payer) side of a payment link, resolved by its token (the token IS the
 * authorization). Minimal disclosure. Amount is SERVER-BOUND: re-resolved live from the payable, and a
 * partial amount is capped at the live balance. Starting/polling a payment reuses the Spec 07 execution
 * layer (PaymentInitiationService.initiateLinkPayment / getLinkPaymentStatus).
 */
@Injectable()
export class PublicPaymentLinkService {
  constructor(
    @InjectRepository(PaymentLink)
    private readonly links: Repository<PaymentLink>,
    @InjectRepository(Business)
    private readonly businesses: Repository<Business>,
    private readonly registry: PayableHandlerRegistry,
    private readonly initiation: PaymentInitiationService,
    private readonly routing: PaymentRoutingService,
  ) {}

  async getPublic(token: string): Promise<PublicPaymentLink> {
    const { link, amountDueMinor } = await this.resolveLive(token)
    const business = await this.businesses.findOne({ where: { id: link.businessId } })
    const methods = (await this.routing.resolveAvailableMethods(link.businessId)).map((m) => m.method)
    return {
      token: link.token,
      businessName: business?.name ?? 'Payment',
      label: link.label ?? 'Payment',
      amountDueMinor,
      amountPaidMinor: Number(link.amountPaidMinor),
      currency: link.currency,
      allowPartial: link.allowPartial,
      status: link.status,
      methods,
    }
  }

  async initiate(
    token: string,
    dto: InitiatePaymentLinkRequest,
  ): Promise<InitiatePaymentLinkResult> {
    const { link, amountDueMinor } = await this.resolveLive(token)
    if (link.status === PaymentLinkStatus.PAID)
      throw new AppBadRequestException('This link is already paid.', 'PAYMENT_LINK_PAID')
    if (link.status === PaymentLinkStatus.CANCELLED || link.status === PaymentLinkStatus.EXPIRED)
      throw new AppBadRequestException('This link is no longer active.', 'PAYMENT_LINK_INACTIVE')

    const method = this.mapMethod(dto.method)
    if (!ROUTABLE_PAYMENT_METHODS.includes(method))
      throw new AppBadRequestException('Unsupported payment method.', 'PAYMENT_METHOD_UNSUPPORTED')

    // Amount is server-bound: partial links honour a requested amount capped at the live balance;
    // fixed links (and open deposits fall back to the requested amount) charge the resolved amount.
    const isDeposit = link.payableType === PayableType.DEPOSIT
    let amountMinor: number
    if (isDeposit) {
      amountMinor = Math.floor(dto.amountMinor ?? 0)
      if (amountMinor <= 0)
        throw new AppBadRequestException('Enter an amount to pay.', 'PAYMENT_AMOUNT_INVALID')
    } else if (link.allowPartial && dto.amountMinor != null) {
      amountMinor = Math.min(Math.floor(dto.amountMinor), amountDueMinor)
      if (amountMinor <= 0)
        throw new AppBadRequestException('Enter a valid amount.', 'PAYMENT_AMOUNT_INVALID')
    } else {
      amountMinor = amountDueMinor
      if (amountMinor <= 0)
        throw new AppBadRequestException('Nothing is owed on this link.', 'PAYABLE_NOTHING_DUE')
    }

    const initiated = await this.initiation.initiateLinkPayment({
      businessId: link.businessId,
      paymentLinkId: link.id,
      method,
      amountMinor,
      currency: link.currency,
      reference: (link.label ?? 'Payment').replace(/\s+/g, '-').slice(0, 60),
      customerPhone: dto.customerPhone,
      clientReference: dto.clientReference,
      returnUrl: dto.returnUrl ? `${dto.returnUrl.replace(/\/+$/, '')}/pay/${token}` : undefined,
    })
    if (!initiated)
      throw new AppBadRequestException(
        'No payment provider is set up for this method.',
        'PAYMENT_METHOD_NOT_ROUTABLE',
      )
    return {
      attemptId: initiated.attemptId,
      kind: initiated.kind,
      ...(initiated.kind === 'redirect' ? { url: initiated.url } : {}),
      ...(initiated.kind === 'elements'
        ? { clientSecret: initiated.clientSecret, publishableKey: initiated.publishableKey }
        : {}),
    }
  }

  async status(token: string): Promise<PaymentLinkPaymentStatus> {
    const link = await this.links.findOne({ where: { token } })
    if (!link) throw new AppNotFoundException('Payment link not found.', 'PAYMENT_LINK_NOT_FOUND')
    if (link.status === PaymentLinkStatus.PAID) return { status: 'PAID' }
    const state = await this.initiation.getLinkPaymentStatus(link.businessId, link.id)
    if (!state) return { status: 'PENDING' }
    return state.reason ? { status: state.status, reason: state.reason } : { status: state.status }
  }

  // ---- internals ----------------------------------------------------------

  /** Load the link by token, expire it if past its window, and re-resolve the LIVE amount owed. */
  private async resolveLive(
    token: string,
  ): Promise<{ link: PaymentLink; amountDueMinor: number }> {
    const link = await this.links.findOne({ where: { token } })
    if (!link) throw new AppNotFoundException('Payment link not found.', 'PAYMENT_LINK_NOT_FOUND')

    if (
      link.status !== PaymentLinkStatus.PAID &&
      link.status !== PaymentLinkStatus.CANCELLED &&
      link.expiresAt.getTime() < Date.now()
    ) {
      await this.links.update(link.id, { status: PaymentLinkStatus.EXPIRED })
      link.status = PaymentLinkStatus.EXPIRED
    }

    const handler = this.registry.get(link.payableType)
    const resolved = handler ? await handler.resolve(link.businessId, link.payableId) : null
    // Deposits are open top-ups (no running balance) → keep the link's stored amount as the display.
    const amountDueMinor =
      link.payableType === PayableType.DEPOSIT
        ? Number(link.amountMinor)
        : (resolved?.amountDueMinor ?? 0)
    return { link, amountDueMinor }
  }

  private mapMethod(method: string): PaymentMethod {
    switch (method.toUpperCase()) {
      case 'MTN_MOMO':
      case 'MTN':
        return PaymentMethod.MTN_MOMO
      case 'ORANGE_MONEY':
      case 'ORANGE':
        return PaymentMethod.ORANGE_MONEY
      case 'CARD':
        return PaymentMethod.CARD
      default:
        return PaymentMethod.CASH // not routable → rejected by the ROUTABLE check
    }
  }
}
