import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { randomBytes } from 'node:crypto'
import {
  PARTIAL_PAYABLE_TYPES,
  PayableType,
  PaymentLinkStatus,
  type CreateGeneralLinkRequest,
  type CreatePaymentLinkRequest,
  type CreateSaleDraftLinkRequest,
  type PaymentLinkView,
} from '@biztrack/types'
import { AppBadRequestException, AppNotFoundException } from '@/common/exceptions/app-exceptions'
import { PaymentLink } from '@/entities/payment-link.entity'
import { PaymentRoutingService } from '@/modules/payments/services/payment-routing.service'
import { IncomeService } from '@/modules/income/income.service'
import { PayableHandlerRegistry } from './payable-handlers'

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000
const OPEN_STATUSES = [PaymentLinkStatus.ACTIVE, PaymentLinkStatus.PARTIALLY_PAID]

/**
 * Spec 08 — create/list/cancel payment links (merchant, authed). The amount is resolved SERVER-SIDE
 * from the payable (never client-supplied). One live link per non-deposit payable is enforced by
 * returning the existing ACTIVE/PARTIALLY_PAID link rather than minting a duplicate.
 */
@Injectable()
export class PaymentLinkService {
  constructor(
    @InjectRepository(PaymentLink)
    private readonly links: Repository<PaymentLink>,
    private readonly registry: PayableHandlerRegistry,
    private readonly routing: PaymentRoutingService,
    private readonly income: IncomeService,
    private readonly config: ConfigService,
  ) { }

  async create(
    businessId: string,
    userId: string | null,
    dto: CreatePaymentLinkRequest,
  ): Promise<PaymentLinkView> {
    const handler = this.registry.get(dto.payableType)
    if (!handler) throw new AppBadRequestException('Unknown payable type.', 'PAYABLE_TYPE_UNKNOWN')

    // Don't mint a dead link: the business must have at least one live (routed + ACTIVE + verified)
    // provider method, else the payer would only hit "no provider" at pay time.
    const methods = await this.routing.resolveAvailableMethods(businessId)
    if (methods.length === 0) {
      throw new AppBadRequestException(
        'Set up a payment provider before sharing a payment link.',
        'PAYMENT_METHOD_NOT_ROUTABLE',
      )
    }

    const resolved = await handler.resolve(businessId, dto.payableId)
    if (!resolved) throw new AppNotFoundException('Payable not found.', 'PAYABLE_NOT_FOUND')

    const isOpen = dto.payableType === PayableType.DEPOSIT // open amount (top-up) — 0 is allowed
    if (!isOpen && resolved.amountDueMinor <= 0) {
      throw new AppBadRequestException('Nothing is owed on this payable.', 'PAYABLE_NOTHING_DUE')
    }

    // One live link per non-deposit payable — hand back the existing one instead of a duplicate.
    if (!isOpen) {
      const existing = await this.links.findOne({
        where: {
          businessId,
          payableType: dto.payableType,
          payableId: dto.payableId,
          status: In(OPEN_STATUSES),
        },
      })
      if (existing) return this.toView(existing)
    }

    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : new Date(Date.now() + DEFAULT_TTL_MS)
    const link = await this.links.save(
      this.links.create({
        businessId,
        token: randomBytes(24).toString('hex'), // 48 hex chars, 192-bit
        payableType: dto.payableType,
        payableId: dto.payableId,
        amountMinor: resolved.amountDueMinor,
        amountPaidMinor: 0,
        currency: resolved.currency,
        allowPartial: PARTIAL_PAYABLE_TYPES.includes(dto.payableType),
        status: PaymentLinkStatus.ACTIVE,
        expiresAt,
        label: dto.label?.trim() || resolved.label,
        customerId: resolved.customerId,
        // NULL for a guest/system creator (e.g. online checkout) — created_by is a uuid column, and an
        // empty string is an invalid uuid (this is what made checkout link-creation throw → mode:'self').
        createdBy: userId || null,
      }),
    )
    return this.toView(link)
  }

  /**
   * Spec 09 — create a SALE_DRAFT intent from the till: the link carries the full sale DTO but no sale
   * exists yet. When the expected amount is collected, settlement materializes the real sale with its
   * true tender. Server-side + online-only (the till POSTs the DTO), so there's no un-synced local sale
   * to 404 on, and it works for anonymous customers.
   */
  async createSaleDraft(
    businessId: string,
    userId: string | null,
    req: CreateSaleDraftLinkRequest,
  ): Promise<PaymentLinkView> {
    const methods = await this.routing.resolveAvailableMethods(businessId)
    if (methods.length === 0) {
      throw new AppBadRequestException(
        'Set up a payment provider before collecting online.',
        'PAYMENT_METHOD_NOT_ROUTABLE',
      )
    }
    const amountMinor = Math.floor(req.amountMinor)
    if (amountMinor <= 0) {
      throw new AppBadRequestException('The amount must be greater than zero.', 'PAYMENT_AMOUNT_INVALID')
    }
    const expiresAt = req.expiresAt ? new Date(req.expiresAt) : new Date(Date.now() + DEFAULT_TTL_MS)
    const link = await this.links.save(
      this.links.create({
        businessId,
        token: randomBytes(24).toString('hex'),
        payableType: PayableType.SALE_DRAFT,
        payableId: randomBytes(16).toString('hex'), // synthetic — the "payable" is the draft on the link
        amountMinor,
        amountPaidMinor: 0,
        currency: 'XAF',
        allowPartial: true, // accumulate toward the total; the sale materializes once fully collected
        status: PaymentLinkStatus.ACTIVE,
        expiresAt,
        label: req.label?.trim() || 'Sale',
        customerId: null,
        createdBy: userId || null,
        draftPayload: (req.sale ?? null) as Record<string, unknown> | null,
      }),
    )
    return this.toView(link)
  }

  /**
   * Spec 10 ① — create a GENERAL payment link: an arbitrary amount collected for any purpose, booked as
   * OTHER INCOME under the chosen category on settlement. Like SALE_DRAFT, it is not tied to an existing
   * payable — it self-describes via `draft_payload` ({ label, note, incomeCategoryId }). `amountMinor` 0
   * = open (the payer chooses); > 0 = a fixed amount (partial-capable).
   */
  async createGeneral(
    businessId: string,
    userId: string | null,
    req: CreateGeneralLinkRequest,
  ): Promise<PaymentLinkView> {
    const methods = await this.routing.resolveAvailableMethods(businessId)
    if (methods.length === 0) {
      throw new AppBadRequestException(
        'Set up a payment provider before sharing a payment link.',
        'PAYMENT_METHOD_NOT_ROUTABLE',
      )
    }
    const label = req.label?.trim()
    if (!label) throw new AppBadRequestException('A label is required.', 'PAYMENT_LABEL_REQUIRED')
    // Validate the income category up-front (must be the business's own or a shared/system category).
    const category = await this.income.resolveCategory(req.incomeCategoryId, businessId)
    const amountMinor = Math.max(0, Math.floor(req.amountMinor))
    const expiresAt = req.expiresAt ? new Date(req.expiresAt) : new Date(Date.now() + DEFAULT_TTL_MS)
    const link = await this.links.save(
      this.links.create({
        businessId,
        token: randomBytes(24).toString('hex'),
        payableType: PayableType.GENERAL,
        payableId: randomBytes(16).toString('hex'), // synthetic — the link IS the payable
        amountMinor,
        amountPaidMinor: 0,
        currency: 'XAF',
        allowPartial: true, // fixed amounts accept partials; an open link (0) lets the payer choose
        status: PaymentLinkStatus.ACTIVE,
        expiresAt,
        label,
        customerId: null,
        createdBy: userId || null,
        draftPayload: {
          label,
          note: req.note ?? null,
          incomeCategoryId: category.id,
        },
      }),
    )
    return this.toView(link)
  }

  async list(businessId: string): Promise<PaymentLinkView[]> {
    const links = await this.links.find({
      where: { businessId },
      order: { createdAt: 'DESC' },
      take: 100,
    })
    return links.map((l) => this.toView(l))
  }

  async cancel(businessId: string, id: string): Promise<void> {
    const link = await this.links.findOne({ where: { id, businessId } })
    if (!link) throw new AppNotFoundException('Payment link not found.', 'PAYMENT_LINK_NOT_FOUND')
    if (link.status === PaymentLinkStatus.PAID) {
      throw new AppBadRequestException('A paid link cannot be cancelled.', 'PAYMENT_LINK_PAID')
    }
    await this.links.update(id, { status: PaymentLinkStatus.CANCELLED })
  }

  /**
   * Spec 09 §4 — "Finish & record balance as credit." The merchant stops collecting online on a
   * partially-paid SALE / ONLINE_ORDER link: whatever was collected stands, the remainder is left as
   * the customer's receivable (the credit sale ALREADY booked a RECEIVABLE debt, which each payment
   * reduced — so there is nothing new to post), and the link goes terminal (PAID = fully accounted:
   * cash + credit). Only sale/order have a "total with a balance to convert"; debts/deposits don't.
   */
  async finalize(businessId: string, id: string): Promise<PaymentLinkView> {
    const link = await this.links.findOne({ where: { id, businessId } })
    if (!link) throw new AppNotFoundException('Payment link not found.', 'PAYMENT_LINK_NOT_FOUND')
    if (link.status === PaymentLinkStatus.PAID) return this.toView(link) // idempotent
    if (
      link.status === PaymentLinkStatus.CANCELLED ||
      link.status === PaymentLinkStatus.EXPIRED
    ) {
      throw new AppBadRequestException('This link is no longer active.', 'PAYMENT_LINK_INACTIVE')
    }
    if (link.payableType !== PayableType.SALE && link.payableType !== PayableType.ONLINE_ORDER) {
      throw new AppBadRequestException(
        'Only a sale or order link can be finalized to credit.',
        'PAYABLE_NOT_FINALIZABLE',
      )
    }
    await this.links.update(id, { status: PaymentLinkStatus.PAID })
    link.status = PaymentLinkStatus.PAID
    return this.toView(link)
  }

  private toView(link: PaymentLink): PaymentLinkView {
    return {
      id: link.id,
      token: link.token,
      url: this.payUrl(link.token),
      payableType: link.payableType,
      payableId: link.payableId,
      amountMinor: Number(link.amountMinor),
      amountPaidMinor: Number(link.amountPaidMinor),
      currency: link.currency,
      allowPartial: link.allowPartial,
      status: link.status,
      label: link.label,
      customerId: link.customerId,
      expiresAt: link.expiresAt.toISOString(),
      createdAt: link.createdAt.toISOString(),
    }
  }

  /** Public pay-page URL. Base from PAYMENT_LINK_BASE_URL (the /pay host); relative if unset. */
  private payUrl(token: string): string {
    const base = (this.config.get<string>('PAYMENT_LINK_BASE_URL') ?? '').replace(/\/+$/, '')
    return `${base}/pay/${token}`
  }
}
