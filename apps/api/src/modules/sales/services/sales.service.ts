import { randomUUID } from 'crypto'
import QRCode from 'qrcode'
import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import type { Logger, LogMetadata } from '@biztrack/logger'
import {
  checkSaleCredit,
  decideSaleRefund,
  decideSaleVoid,
  discountNeedsAuthorization,
  hasPriceDrift,
  isBelowCost,
  netCashierRoster,
  netDailySales,
  netSalesByProduct,
  netSalesSummary,
  priceSale,
  PROFIT_SALE_STATUSES,
  refundProfitImpact,
  refundsReport,
  returnDebtReduction,
  returnsByCashier,
  returnTotals,
  returnTotalsBy,
  reviewSerialAlreadySold,
  reviewStockAfterSyncedSale,
  reviewSyncedDiscount,
  reviewSyncedRefund,
  roundQuantity,
  saleOpensDebt,
  saleReturnStatus,
  saleStockLines,
  settleSale,
  settleSaleFromLedger,
  staffMay,
  storedPaymentMethod,
  toWholeXaf,
  variantCost,
} from '@biztrack/domain'
import {
  DebtDirection,
  DebtSource,
  PaymentMethod,
  ProductType,
  SalePaymentKind,
  SaleSource,
  SaleStatus,
  SerialUnitStatus,
  type CashierPerformanceRow,
  type CashierShiftSummary,
  type DailySalesRow,
  type DailySalesSummary,
  type JwtPayload,
  type RefundCashierRow,
  type RefundReasonRow,
  type SaleSyncPayload,
  type SalesByPaymentRow,
  type SalesByProductRow,
  type ReviewFlagDraft,
  type SalesQuery,
} from '@biztrack/types'
import { I18nService } from 'nestjs-i18n'
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm'
import { AppException } from '@/common/exceptions/app.exception'
import { ReviewFlagsService } from '@/modules/review-flags/review-flags.service'
import { loadSyncedDiscountContext } from './sales-discount-review.query'
import {
  loadNetSalesProfit,
  loadPeriodReturnLines,
  loadSaleRefundImpact,
} from './sales-profit.query'
import {
  AppBadRequestException,
  AppForbiddenException,
  AppInternalServerException,
  AppNotFoundException,
} from '@/common/exceptions/app-exceptions'
import { Business } from '@/entities/business.entity'
import { AuditService } from '@/modules/audit/audit.service'
import { BusinessCalendarService } from '@/modules/business-calendar/business-calendar.service'
import { PostingDateService } from '@/modules/fiscal/posting-date.service'
import type { AuditContext, RefundSaleInput } from '@biztrack/types'
import { Product } from '@/entities/product.entity'
import { ProductVariant } from '@/entities/product-variant.entity'
import { ProductBundleComponent } from '@/entities/product-bundle-component.entity'
import { ProductSerialUnit } from '@/entities/product-serial-unit.entity'
import { Sale } from '@/entities/sale.entity'
import { SaleCharge } from '@/entities/sale-charge.entity'
import { SaleDiscount } from '@/entities/sale-discount.entity'
import { Role } from '@/entities/role.entity'
import { SaleItem } from '@/entities/sale-item.entity'
import { SalePayment } from '@/entities/sale-payment.entity'
import { PaymentAttempt } from '@/entities/payment-attempt.entity'
import { SaleReturn } from '@/entities/sale-return.entity'
import { SaleReturnItem } from '@/entities/sale-return-item.entity'
import type { I18nTranslations } from '@/i18n/i18n.types'
import { LOGGER } from '@/logger/logger.module'
import { DebtsService } from '@/modules/debts/services/debts.service'
import { InventoryService } from '@/modules/inventory/services/inventory.service'
import { DepositsService } from '@/modules/savings/services/savings.service'
import { ProcurementSendService } from '@/modules/documents/procurement-send.service'
import { Contact } from '@/entities/contact.entity'
import { renderSaleReceiptHtml, saleReceiptLabels } from '@biztrack/templates'
import type { CreateSaleDto, CreateSaleItemDto } from '../dto/create-sale.dto'
import type { SendSaleReceiptDto } from '../dto/send-sale-receipt.dto'
import type { VoidSaleDto } from '../dto/void-sale.dto'
import { SaleReceiptDto } from '../dto/sale-response.dto'
import { DailySalesSummaryService } from './daily-sales-summary.service'
import { SaleNumberService } from './sale-number.service'

export interface SalesSummary {
  revenue: number
  transactions: number
  averageBasket: number
  itemsSold: number
  refundCount: number
  refundAmount: number
  currency: string
}

/** Input for {@link SalesService.recordPayment} — a single collected payment against a sale. */
export interface RecordSalePaymentInput {
  /** Optional client-supplied id for idempotent replay; generated when omitted. */
  id?: string
  method: PaymentMethod
  amount: number
  mobileMoneyReference?: string | null
  note?: string | null
  /** YYYY-MM-DD for the receivable payment; defaults to today. */
  paymentDate?: string
}

type ComputedSaleItem = {
  product: Product
  variantId: string | null
  variantName: string | null
  serialUnitId: string | null
  serialNumber: string | null
  quantity: number
  unitPrice: number
  unitPriceListed: number
  cartDiscountAlloc: number
  discountAmount: number
  lineTotal: number
  costPrice: number | null
  // Line-scoped discounts derived from an OVERRIDE (charged < listed) and/or an
  // explicit line discount. Σ(amounts) === discountAmount (the BIZ-1.2 invariant).
  lineDiscounts: DerivedLineDiscount[]
}

type DerivedLineDiscount = {
  discountType: string
  amount: number
  description: string
  reasonCode: string | null
  reasonNote: string | null
}

type SaleComputationInput = {
  discountAmount?: number
  chargesAmount?: number
  items: Array<{
    productId: string
    variantId?: string | null
    variantName?: string | null
    serialUnitId?: string | null
    serialNumber?: string | null
    quantity: number
    unitPrice: number
    unitPriceListed?: number
    discountAmount?: number
    costPrice?: number
    reasonCode?: string | null
    reasonNote?: string | null
  }>
}

@Injectable()
export class SalesService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Business)
    private readonly businessesRepo: Repository<Business>,
    @InjectRepository(Sale)
    private readonly salesRepo: Repository<Sale>,
    @InjectRepository(Contact)
    private readonly contactsRepo: Repository<Contact>,
    private readonly procurementSend: ProcurementSendService,
    private readonly debtsService: DebtsService,
    private readonly inventoryService: InventoryService,
    private readonly savingsService: DepositsService,
    private readonly saleNumberService: SaleNumberService,
    private readonly dailySummaryService: DailySalesSummaryService,
    private readonly auditService: AuditService,
    private readonly calendar: BusinessCalendarService,
    private readonly postingDate: PostingDateService,
    private readonly i18n: I18nService<I18nTranslations>,
    private readonly config: ConfigService,
    @Inject(LOGGER) private readonly logger: Logger,
    private readonly reviewFlags: ReviewFlagsService,
  ) {
    this.logger.setContext('SalesService')
  }

  /**
   * Render a sale's receipt HTML with the business's own settings — the SINGLE receipt
   * render path shared by the public receipt page, the emailed/WhatsApp send, and the PDF.
   * Mirrors the desktop's IPC render so all channels produce the exact same shape, including
   * the QR (encoding the /r/<saleId> digital-receipt URL) when the business enabled it.
   */
  private async renderReceiptHtmlFor(
    sale: Sale,
    business: Business,
    locale: string,
  ): Promise<string> {
    const receipt = SaleReceiptDto.fromSale(sale, business)
    const s = business.receiptSettings
    const showQr = s?.showQr !== false
    const qrImage = showQr ? await this.buildReceiptQr(sale.id) : null
    return renderSaleReceiptHtml(receipt, {
      labels: saleReceiptLabels(locale),
      locale,
      widthMm: s?.paperWidthMm ?? 58,
      showNiu: s?.showNiu,
      showCashier: s?.showCashier,
      showPayment: s?.showPayment,
      showThanks: s?.showThanks,
      showLogo: s?.showLogo,
      showQr: showQr && !!qrImage,
      qrImage: qrImage ?? undefined,
    })
  }

  /** QR encoding the public digital-receipt URL (same as desktop). Null if no base URL / on error. */
  private async buildReceiptQr(saleId: string): Promise<string | null> {
    const base = (this.config.get<string>('PAYMENT_LINK_BASE_URL') ?? '').replace(/\/+$/, '')
    if (!base) return null
    try {
      return await QRCode.toDataURL(`${base}/r/${saleId}`, { margin: 1, width: 200 })
    } catch {
      return null
    }
  }

  async create(businessId: string, user: JwtPayload, dto: CreateSaleDto, context?: AuditContext) {
    try {
      const existing = await this.salesRepo.findOne({
        where: {
          businessId,
          clientId: dto.clientId,
        },
      })

      if (existing) {
        return this.findById(existing.id, businessId)
      }

      let saleId: string | null = null
      // Hoisted for the post-commit DISCOUNT_APPLIED audit (BIZ-2.9) — only emitted when a
      // discount was flagged unauthorized or below-cost.
      let auditDiscountUnauthorized = false
      let auditDiscountBelowCost = false
      let auditDiscountTotal = 0

      await this.dataSource.transaction(async (manager) => {
        const saleRepo = manager.getRepository(Sale)
        const existingInTransaction = await saleRepo.findOne({
          where: {
            businessId,
            clientId: dto.clientId,
          },
        })

        if (existingInTransaction) {
          saleId = existingInTransaction.id
          return
        }

        const soldAt = this.normalizeDate(dto.soldAt)
        const saleDate = soldAt.toISOString().slice(0, 10)
        // Serialised lines carry serialUnitIds[]; expand each into one item per unit so
        // the rest of the pipeline (load/validate/mark) works one-unit-at-a-time. When
        // charge/discount lines are supplied, derive the sale totals from their sum.
        const computeDto: CreateSaleDto = {
          ...dto,
          items: this.expandSerialItems(dto.items),
          chargesAmount: dto.charges?.length
            ? toWholeXaf(dto.charges.reduce((sum, c) => sum + (c.amount || 0), 0))
            : dto.chargesAmount,
          discountAmount: dto.discounts?.length
            ? toWholeXaf(dto.discounts.reduce((sum, d) => sum + (d.amount || 0), 0))
            : dto.discountAmount,
        }
        const { products, variantsById, serialUnitsById } = await this.loadProductsForSale(
          manager,
          businessId,
          computeDto,
        )
        const computed = this.computeSale(products, variantsById, serialUnitsById, computeDto)
        const { amountPaid, changeGiven } = settleSale({
          totalAmount: computed.totalAmount,
          payments: dto.payments,
        })
        const { customerId, creditAmount } = await this.resolveSaleCreditContext(
          manager,
          businessId,
          dto.customerId,
          computed.totalAmount,
          amountPaid,
        )
        const paymentMethod = storedPaymentMethod(dto.payments)
        const momoReference = this.firstMobileMoneyReference(dto.payments)

        const saleNumber = await this.saleNumberService.generate(businessId, saleDate, manager)
        const now = new Date()
        // Local trading day (BIZ-5.1). A cloud cashier's sale rung at a till inherits its shift's
        // business_date so a shift straddling the cutover keeps one day; otherwise it comes from the
        // business timezone + cutover. Distinct from the UTC saleDate.
        const businessDate = await this.calendar.businessDateFor(
          businessId,
          soldAt,
          dto.cashSessionId ?? null,
        )
        // BIZ-5.4: the accounting day this sale posts to (redated forward if its period is closed).
        const posting = await this.postingDate.resolve(businessId, businessDate, manager)

        const sale = await saleRepo.save(
          saleRepo.create({
            businessId,
            clientId: dto.clientId,
            cashierId: user.sub,
            saleNumber,
            status: SaleStatus.COMPLETED,
            subtotal: computed.subtotal,
            discountAmount: computed.saleDiscountAmount,
            chargesAmount: computed.saleChargesAmount,
            taxAmount: 0,
            totalAmount: computed.totalAmount,
            amountPaid,
            creditAmount,
            paymentMethod,
            momoReference,
            changeGiven,
            customerId,
            customerName: dto.customerName?.trim() || null,
            customerPhone: dto.customerPhone?.trim() || null,
            notes: dto.notes?.trim() || null,
            priceDriftWarning: computed.priceDriftWarning,
            saleDate,
            businessDate,
            postingDate: posting.postingDate,
            isLateArrival: posting.isLateArrival,
            originalPeriodId: posting.originalPeriodId,
            soldAt,
            cashSessionId: dto.cashSessionId ?? null,
            syncedAt: now,
          }),
        )

        const itemRepo = manager.getRepository(SaleItem)
        const saleItems = await itemRepo.save(
          computed.items.map((item) =>
            itemRepo.create({
              saleId: sale.id,
              businessId,
              productId: item.product.id,
              variantId: item.variantId,
              variantName: item.variantName,
              serialUnitId: item.serialUnitId,
              serialNumber: item.serialNumber,
              productName: item.product.name,
              productSku: item.product.sku ?? null,
              unitOfMeasure: item.product.unitOfMeasure?.abbreviation ?? null,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              unitPriceListed: item.unitPriceListed,
              cartDiscountAlloc: item.cartDiscountAlloc,
              discountAmount: item.discountAmount,
              lineTotal: item.lineTotal,
              totalPrice: item.lineTotal,
              costPrice: item.costPrice,
            }),
          ),
        )

        // BIZ-1.4: evaluate the cashier's role discount limits. Over-limit discounts
        // still complete (APPROVE) but are flagged unauthorized unless a manager
        // authorized them via step-up (dto.authorizedByUserId).
        const role = user.roleId
          ? await manager.getRepository(Role).findOne({ where: { id: user.roleId } })
          : null
        const authorizedBy = dto.authorizedByUserId ?? null
        // BIZ-1.5: a line sold below cost needs the same manager authorization, unless
        // the role may sell below cost. Cost is the per-line snapshot; a null cost is
        // skipped silently.
        const belowCost = this.saleIsBelowCost(computed)
        const { needsAuthorization } = discountNeedsAuthorization(
          {
            maxDiscountPercent: role?.maxDiscountPercent ?? null,
            maxCartDiscountPercent: role?.maxCartDiscountPercent ?? null,
            maxDiscountAmountXaf: role?.maxDiscountAmountXaf ?? null,
            allowBelowCost: role?.allowBelowCost ?? false,
          },
          this.saleDiscountInput(computed),
          belowCost,
        )
        const discountUnauthorized = needsAuthorization && !authorizedBy
        auditDiscountUnauthorized = discountUnauthorized
        auditDiscountBelowCost = belowCost
        auditDiscountTotal = Math.round(
          computed.saleDiscountAmount +
            computed.items.reduce((sum, it) => sum + it.discountAmount, 0),
        )

        // LINE-scoped discounts (OVERRIDE / explicit) so each line's discount_amount
        // reconciles with its sale_discounts rows (BIZ-1.2 invariant).
        const lineDiscountRepo = manager.getRepository(SaleDiscount)
        const lineDiscountRows: SaleDiscount[] = []
        computed.items.forEach((item, i) => {
          const savedItem = saleItems[i]
          if (!savedItem) return
          for (const d of item.lineDiscounts) {
            lineDiscountRows.push(
              lineDiscountRepo.create({
                id: randomUUID(),
                saleId: sale.id,
                saleItemId: savedItem.id,
                businessId,
                description: d.description,
                discountType: d.discountType,
                amount: d.amount,
                reasonCode: d.reasonCode,
                reasonNote: d.reasonNote,
                appliedBy: user.sub,
                authorizedBy,
                unauthorized: discountUnauthorized,
                belowCost,
              }),
            )
          }
        })
        if (lineDiscountRows.length) await lineDiscountRepo.save(lineDiscountRows)

        const paymentRepo = manager.getRepository(SalePayment)
        const salePayments = await paymentRepo.save(
          dto.payments.map((payment) =>
            paymentRepo.create({
              saleId: sale.id,
              businessId,
              method: payment.method,
              amount: toWholeXaf(payment.amount),
              mobileMoneyReference: payment.mobileMoneyReference?.trim() || null,
              savingsAccountId: payment.savingsAccountId ?? null,
              paymentAttemptId: payment.paymentAttemptId ?? null,
              businessDate,
              postingDate: posting.postingDate,
              isLateArrival: posting.isLateArrival,
              originalPeriodId: posting.originalPeriodId,
            }),
          ),
        )

        // Persist the charge/discount breakdown (totals already folded into the sale).
        if (dto.charges?.length) {
          const chargeRepo = manager.getRepository(SaleCharge)
          await chargeRepo.save(
            dto.charges.map((c) =>
              chargeRepo.create({
                saleId: sale.id,
                businessId,
                chargeTypeId: c.chargeTypeId ?? null,
                name: c.name,
                rateType: c.rateType,
                rateValue: c.rateValue,
                amount: toWholeXaf(c.amount),
              }),
            ),
          )
        }
        if (dto.discounts?.length) {
          const discountRepo = manager.getRepository(SaleDiscount)
          await discountRepo.save(
            dto.discounts.map((d) =>
              discountRepo.create({
                id: randomUUID(),
                saleId: sale.id,
                saleItemId: d.saleItemId ?? null,
                businessId,
                description: d.description,
                discountType: d.discountType,
                rate: d.rate ?? null,
                amount: toWholeXaf(d.amount),
                reasonCode: d.reasonCode ?? null,
                reasonNote: d.reasonNote ?? null,
                appliedBy: user.sub,
                authorizedBy,
                unauthorized: discountUnauthorized,
                belowCost,
              }),
            ),
          )
        }

        // Draw down customer deposits for any SAVINGS payments (deduct + usage txn).
        for (const payment of dto.payments) {
          if (payment.method === PaymentMethod.SAVINGS && payment.savingsAccountId) {
            await this.savingsService.recordSaleUsage(
              manager,
              businessId,
              {
                savingsId: payment.savingsAccountId,
                saleId: sale.id,
                amount: toWholeXaf(payment.amount),
                recordedById: user.sub,
              },
              now,
            )
          }
        }

        await this.inventoryService.deductForSale(
          businessId,
          sale.id,
          sale.saleNumber,
          user.sub,
          await this.expandSaleItemsForInventory(
            manager,
            businessId,
            saleItems.map((item) => ({
              productId: item.productId,
              variantId: item.variantId ?? null,
              productName: item.productName,
              quantity: item.quantity,
            })),
          ),
          manager,
        )

        await this.markSerialUnitsSold(manager, businessId, sale.id, customerId ?? null, saleItems)

        await this.dailySummaryService.incrementForSale(sale, saleItems, salePayments, manager)

        if (creditAmount > 0 && customerId) {
          await this.debtsService.createSourceDebt(manager, {
            businessId,
            contactId: customerId,
            direction: DebtDirection.RECEIVABLE,
            sourceType: DebtSource.SALE,
            sourceId: sale.id,
            sourceReference: sale.saleNumber,
            originalAmount: creditAmount,
            dueDate: dto.creditDueDate ?? null,
            notes: dto.notes?.trim() || null,
            createdAt: soldAt,
          })
        }
        saleId = sale.id
      })

      if (!saleId) {
        throw new AppInternalServerException('Sale creation failed.', 'SALE_CREATE_FAILED')
      }

      const result = await this.findById(saleId, businessId)
      if (context) {
        this.auditService.log(context, {
          action: 'CREATE',
          entityType: 'sale',
          entityId: saleId,
          entityLabel: result.saleNumber,
          changes: {
            before: null,
            after: { totalAmount: result.totalAmount, itemCount: result.items?.length ?? 0 },
          },
        })
        // BIZ-2.9: a flagged discount (unauthorized or below-cost) is the financially sensitive
        // event — record it distinctly so it's queryable without scanning every sale.
        if (auditDiscountUnauthorized || auditDiscountBelowCost) {
          this.auditService.log(context, {
            action: 'DISCOUNT_APPLIED',
            entityType: 'sale',
            entityId: saleId,
            entityLabel: result.saleNumber,
            amount: auditDiscountTotal,
            changes: {
              before: null,
              after: {
                unauthorized: auditDiscountUnauthorized,
                belowCost: auditDiscountBelowCost,
              },
            },
          })
        }
      }
      return result
    } catch (error) {
      if (this.isUniqueConstraintViolation(error, 'unq_sales_business_id_client_id')) {
        const existing = await this.salesRepo.findOne({
          where: {
            businessId,
            clientId: dto.clientId,
          },
        })

        if (existing) {
          return this.findById(existing.id, businessId)
        }
      }

      return this.handleServiceError('create', error, {
        businessId,
        userId: user.sub,
        clientId: dto.clientId,
      })
    }
  }

  async createFromSync(businessId: string, payload: SaleSyncPayload) {
    try {
      let saleId: string | null = null
      // A sale from an offline till already happened: it is recorded as it happened, and
      // anything the server disagrees with becomes a review flag for the owner instead of a
      // rejection (rulings R1 and R3). Online orders are posted by the server, so they keep
      // the strict checks.
      const fromOfflineTill = !payload.onlineOrderId && payload.source !== SaleSource.ONLINE
      const flagDrafts: ReviewFlagDraft[] = []
      let raisedFlags: ReviewFlagDraft[] = []

      const apply = async (manager: EntityManager): Promise<void> => {
        const saleRepo = manager.getRepository(Sale)
        const targetStatus = this.normalizeSyncSaleStatus(payload.status)
        const existingInTransaction = await saleRepo.findOne({
          where: {
            businessId,
            clientId: payload.clientId,
          },
        })

        if (existingInTransaction) {
          saleId = existingInTransaction.id

          if (
            targetStatus === SaleStatus.VOIDED &&
            existingInTransaction.status !== SaleStatus.VOIDED
          ) {
            await this.applyVoidFromSync(manager, businessId, existingInTransaction.id, payload)
          } else if (
            (targetStatus === SaleStatus.REFUNDED ||
              targetStatus === SaleStatus.PARTIALLY_REFUNDED) &&
            (payload.returns?.length ?? 0) > 0
          ) {
            await this.applyRefundFromSync(
              manager,
              businessId,
              existingInTransaction.id,
              payload,
              flagDrafts,
            )
          }

          return
        }

        const soldAt = this.normalizeDate(payload.soldAt)
        const saleDate = soldAt.toISOString().slice(0, 10)
        const { products, variantsById, serialUnitsById } = await this.loadProductsForSale(
          manager,
          businessId,
          payload,
          { allowUnavailableSerials: fromOfflineTill },
        )
        const computed = this.computeSale(products, variantsById, serialUnitsById, payload)
        const { amountPaid, changeGiven } = settleSale({
          totalAmount: computed.totalAmount,
          payments: payload.payments,
        })
        // An online order's balance is cash on delivery, collected on the order (R20). Only a
        // sale for a real order of this business counts, so a till cannot claim it.
        const collectedOnDelivery =
          payload.source === SaleSource.ONLINE &&
          !!payload.onlineOrderId &&
          (await this.isOnlineOrder(manager, businessId, payload.onlineOrderId))
        const { customerId, creditAmount } = await this.resolveSaleCreditContext(
          manager,
          businessId,
          payload.customerId,
          computed.totalAmount,
          amountPaid,
          payload.creditAmount,
          collectedOnDelivery,
        )
        const paymentMethod = storedPaymentMethod(payload.payments)
        const momoReference = this.firstMobileMoneyReference(payload.payments)

        const cashierId = this.resolveSyncCashierId(payload)
        let saleNumber = payload.saleNumber?.trim() || null

        if (!saleNumber) {
          saleNumber = await this.saleNumberService.generate(businessId, saleDate, manager)
        } else {
          const existingByNumber = await saleRepo.findOne({
            where: {
              businessId,
              saleNumber,
            },
          })

          if (existingByNumber && existingByNumber.clientId !== payload.clientId) {
            saleNumber = await this.saleNumberService.generate(businessId, saleDate, manager)
          }
        }

        const now = new Date()
        // Recompute the trading day authoritatively from the business calendar (or the shift),
        // trusting the device's value only as a hint — the server has the real timezone/cutover.
        const businessDate = await this.calendar.resolveForSync(
          businessId,
          soldAt,
          payload.businessDate,
          payload.cashSessionId ?? null,
        )
        // BIZ-5.4: a sale that synced up after its period closed is redated forward (late arrival).
        const posting = await this.postingDate.resolve(businessId, businessDate, manager)

        const sale = await saleRepo.save(
          saleRepo.create({
            id: payload.saleId,
            businessId,
            clientId: payload.clientId,
            cashierId,
            saleNumber,
            source: payload.source === SaleSource.ONLINE ? SaleSource.ONLINE : SaleSource.IN_STORE,
            onlineOrderId: payload.onlineOrderId ?? null,
            status: SaleStatus.COMPLETED,
            subtotal: computed.subtotal,
            discountAmount: computed.saleDiscountAmount,
            chargesAmount: computed.saleChargesAmount,
            taxAmount: 0,
            totalAmount: computed.totalAmount,
            amountPaid,
            creditAmount,
            paymentMethod,
            momoReference,
            changeGiven,
            customerId,
            customerName: payload.customerName?.trim() || null,
            customerPhone: payload.customerPhone?.trim() || null,
            notes: payload.notes?.trim() || null,
            priceDriftWarning: computed.priceDriftWarning,
            saleDate,
            businessDate,
            postingDate: posting.postingDate,
            isLateArrival: posting.isLateArrival,
            originalPeriodId: posting.originalPeriodId,
            soldAt,
            cashSessionId: payload.cashSessionId ?? null,
            syncedAt: now,
            voidedAt: null,
            voidedById: null,
            voidReason: null,
          }),
        )

        const itemRepo = manager.getRepository(SaleItem)
        const saleItems = await itemRepo.save(
          computed.items.map((item, index) =>
            itemRepo.create({
              id: payload.items[index]?.id ?? undefined,
              saleId: sale.id,
              businessId,
              productId: item.product.id,
              variantId: item.variantId,
              variantName: item.variantName,
              serialUnitId: item.serialUnitId,
              serialNumber: item.serialNumber,
              productName: item.product.name,
              productSku: item.product.sku ?? null,
              unitOfMeasure: item.product.unitOfMeasure?.abbreviation ?? null,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              unitPriceListed: item.unitPriceListed,
              cartDiscountAlloc: item.cartDiscountAlloc,
              discountAmount: item.discountAmount,
              lineTotal: item.lineTotal,
              totalPrice: item.lineTotal,
              costPrice: item.costPrice,
            }),
          ),
        )

        const paymentRepo = manager.getRepository(SalePayment)
        const salePayments = await paymentRepo.save(
          payload.payments.map((payment) =>
            paymentRepo.create({
              id: payment.id,
              saleId: sale.id,
              businessId,
              method: payment.method,
              amount: toWholeXaf(payment.amount),
              mobileMoneyReference: payment.mobileMoneyReference?.trim() || null,
              savingsAccountId: payment.savingsAccountId ?? null,
              paymentAttemptId: payment.paymentAttemptId ?? null,
              businessDate,
              postingDate: posting.postingDate,
              isLateArrival: posting.isLateArrival,
              originalPeriodId: posting.originalPeriodId,
            }),
          ),
        )

        // Back-link any in-store provider attempts to the Sale they settled (Spec 07 §7.2). The
        // attempt CONFIRMED before the Sale existed, so its sale_id is filled in here, at post time.
        // The forward link (sale_payments.payment_attempt_id) is already written above; this is the
        // reverse convenience for reconciliation/fees. Scoped to businessId; safe if already set.
        const attemptIds = salePayments
          .map((p) => p.paymentAttemptId)
          .filter((id): id is string => Boolean(id))
        if (attemptIds.length > 0) {
          await manager
            .getRepository(PaymentAttempt)
            .update({ id: In(attemptIds), businessId }, { saleId: sale.id })
        }

        if (payload.charges && payload.charges.length > 0) {
          const chargeRepo = manager.getRepository(SaleCharge)
          for (const c of payload.charges) {
            const existing = await chargeRepo.findOne({ where: { id: c.id } })
            if (!existing) {
              await chargeRepo.save(
                chargeRepo.create({
                  id: c.id,
                  saleId: sale.id,
                  businessId,
                  chargeTypeId: c.chargeTypeId ?? null,
                  name: c.name,
                  rateType: c.rateType,
                  rateValue: c.rateValue,
                  amount: toWholeXaf(c.amount),
                }),
              )
            }
          }
        }

        if (payload.discounts && payload.discounts.length > 0) {
          const discountRepo = manager.getRepository(SaleDiscount)
          for (const d of payload.discounts) {
            const existing = await discountRepo.findOne({ where: { id: d.id } })
            if (!existing) {
              await discountRepo.save(
                discountRepo.create({
                  id: d.id,
                  saleId: sale.id,
                  saleItemId: d.saleItemId ?? null,
                  businessId,
                  description: d.description,
                  discountType: d.discountType,
                  rate: d.rate ?? null,
                  amount: toWholeXaf(d.amount),
                  reasonCode: d.reasonCode ?? null,
                  reasonNote: d.reasonNote ?? null,
                  // Client-authoritative for synced sales (the device computed authz).
                  appliedBy: d.appliedBy ?? cashierId,
                  authorizedBy: d.authorizedBy ?? null,
                  unauthorized: d.unauthorized ?? false,
                  belowCost: d.belowCost ?? false,
                }),
              )
            }
          }
        }

        // R2: decide again whether the discount needed a manager, with the limits in force
        // when the sale was made. The till's rows above are kept as sent; a disagreement
        // becomes a flag.
        if (fromOfflineTill) {
          const context = await loadSyncedDiscountContext(
            manager,
            businessId,
            payload,
            cashierId,
            soldAt,
          )
          const flag = context.till
            ? reviewSyncedDiscount({
                saleId: sale.id,
                discount: this.saleDiscountInput(computed),
                belowCost: this.saleIsBelowCost(computed),
                till: context.till,
                cashierPolicy: context.cashierPolicy,
                tillPolicy: context.tillPolicy,
                approverPolicy: context.approverPolicy,
              })
            : null
          if (flag) flagDrafts.push(flag)
        }

        const shortfalls = await this.inventoryService.deductForSale(
          businessId,
          sale.id,
          sale.saleNumber,
          cashierId,
          await this.expandSaleItemsForInventory(
            manager,
            businessId,
            saleItems.map((item, index) => ({
              productId: item.productId,
              variantId: item.variantId ?? null,
              productName: item.productName,
              quantity: item.quantity,
              movementId: payload.items[index]?.movementId ?? null,
            })),
          ),
          manager,
          { allowNegative: fromOfflineTill },
        )
        for (const shortfall of shortfalls) {
          const flag = reviewStockAfterSyncedSale({
            saleId: sale.id,
            ...shortfall,
          })
          if (flag) flagDrafts.push(flag)
        }

        // Online orders post the sale at confirm but keep serials RESERVED until handover
        // (deferSerialSold); they flip to SOLD when the order is delivered/picked up.
        if (!payload.deferSerialSold) {
          const serialConflicts = await this.markSerialUnitsSold(
            manager,
            businessId,
            sale.id,
            customerId ?? null,
            saleItems,
            { tolerateUnavailable: fromOfflineTill },
          )
          // The unit stays with the sale that already holds it; this sale stands too, and
          // the owner is told one physical unit is on two sales.
          for (const serialUnitId of serialConflicts) {
            const unit = await manager
              .getRepository(ProductSerialUnit)
              .findOne({ where: { id: serialUnitId, businessId } })
            flagDrafts.push(
              reviewSerialAlreadySold({
                saleId: sale.id,
                serialUnitId,
                serialNumber: unit?.serialNumber ?? null,
                soldOnSaleId: unit?.saleId ?? null,
              }),
            )
          }
        }

        await this.dailySummaryService.incrementForSale(sale, saleItems, salePayments, manager)

        if (saleOpensDebt({ creditAmount, hasCustomer: !!customerId, collectedOnDelivery })) {
          await this.debtsService.createSourceDebt(manager, {
            businessId,
            contactId: customerId!,
            direction: DebtDirection.RECEIVABLE,
            sourceType: DebtSource.SALE,
            sourceId: sale.id,
            sourceReference: sale.saleNumber,
            originalAmount: creditAmount,
            dueDate: payload.creditDueDate ?? null,
            notes: payload.notes?.trim() || null,
            createdAt: soldAt,
          })
        }

        if (targetStatus === SaleStatus.VOIDED) {
          await this.applyVoidFromSync(manager, businessId, sale.id, payload)
        } else if (
          (targetStatus === SaleStatus.REFUNDED ||
            targetStatus === SaleStatus.PARTIALLY_REFUNDED) &&
          (payload.returns?.length ?? 0) > 0
        ) {
          // A sale rung + returned offline before its first sync — apply the return after insert.
          await this.applyRefundFromSync(manager, businessId, sale.id, payload, flagDrafts)
        }
        saleId = sale.id
      }

      await this.dataSource.transaction(async (manager) => {
        await apply(manager)
        raisedFlags = await this.reviewFlags.raise(manager, businessId, flagDrafts)
      })
      // Tell the owner only once the sale and its flags are committed.
      void this.reviewFlags.notify(businessId, raisedFlags, payload.saleNumber)

      if (!saleId) {
        throw new AppInternalServerException(
          'Sale sync creation failed.',
          'SALE_SYNC_CREATE_FAILED',
        )
      }

      return this.findById(saleId, businessId)
    } catch (error) {
      if (this.isUniqueConstraintViolation(error, 'unq_sales_business_id_client_id')) {
        const existing = await this.salesRepo.findOne({
          where: {
            businessId,
            clientId: payload.clientId,
          },
        })

        if (existing) {
          return this.findById(existing.id, businessId)
        }
      }

      return this.handleServiceError('createFromSync', error, {
        businessId,
        saleId: payload.saleId,
        clientId: payload.clientId,
      })
    }
  }

  async findAll(businessId: string, query: SalesQuery) {
    try {
      const qb = this.salesRepo
        .createQueryBuilder('sale')
        .leftJoinAndSelect('sale.cashier', 'cashier')
        .leftJoinAndSelect('sale.business', 'business')
        .leftJoinAndSelect('sale.payments', 'payments')
        .loadRelationCountAndMap('sale.itemCount', 'sale.items')
        .where('sale.business_id = :businessId', { businessId })
        .distinct(true)

      // BIZ-5.1: filter by the local trading day (business_date, fallback sale_date), matching
      // the desktop list + the reports.
      if (query.dateFrom) {
        qb.andWhere('COALESCE(sale.business_date, sale.sale_date) >= :dateFrom', {
          dateFrom: query.dateFrom,
        })
      }

      if (query.dateTo) {
        qb.andWhere('COALESCE(sale.business_date, sale.sale_date) <= :dateTo', {
          dateTo: query.dateTo,
        })
      }

      if (query.status) {
        qb.andWhere('sale.status = :status', { status: query.status })
      }

      if (query.cashierId) {
        qb.andWhere('sale.cashier_id = :cashierId', { cashierId: query.cashierId })
      }

      if (query.search?.trim()) {
        qb.andWhere(
          "(LOWER(sale.sale_number) LIKE :search OR LOWER(COALESCE(sale.customer_name, '')) LIKE :search)",
          { search: `%${query.search.trim().toLowerCase()}%` },
        )
      }

      if (query.paymentMethod) {
        if (query.paymentMethod === PaymentMethod.MIXED) {
          qb.andWhere(
            `(
              sale.payment_method = :mixedPaymentMethod
              OR sale.id IN (
                SELECT sp.sale_id
                FROM sale_payments sp
                GROUP BY sp.sale_id
                HAVING COUNT(DISTINCT sp.method) > 1
              )
            )`,
            { mixedPaymentMethod: PaymentMethod.MIXED },
          )
        } else {
          qb.andWhere(
            `
            (
              sale.payment_method = :paymentMethod
              OR EXISTS (
                SELECT 1
                FROM sale_payments sp
                WHERE sp.sale_id = sale.id
                  AND sp.method = :paymentMethod
              )
            )
          `,
            { paymentMethod: query.paymentMethod },
          )
        }
      }

      if (query.source) {
        // Null source (pre-migration rows) counts as in-store.
        if (query.source === SaleSource.ONLINE) {
          qb.andWhere('sale.source = :saleSource', { saleSource: SaleSource.ONLINE })
        } else {
          qb.andWhere('(sale.source = :saleSource OR sale.source IS NULL)', {
            saleSource: SaleSource.IN_STORE,
          })
        }
      }

      const sort = this.resolveSortField(query.sortBy)
      const sortOrder = query.sortOrder ?? 'DESC'
      const page = Math.max(query.page ?? 1, 1)
      const limit = Math.min(Math.max(query.limit ?? 20, 1), 100)
      const skip = (page - 1) * limit
      const [rows, total] = await qb
        .orderBy(sort, sortOrder)
        .skip(skip)
        .take(limit)
        .getManyAndCount()

      return {
        data: rows,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }
    } catch (error) {
      return this.handleServiceError('findAll', error, { businessId })
    }
  }

  async findById(id: string, businessId: string) {
    try {
      const sale = await this.findSaleDetailBy('sale.id = :id', { id, businessId })

      if (!sale) {
        throw new AppNotFoundException(
          await this.i18n.translate('errors.sale_not_found'),
          'SALE_NOT_FOUND',
        )
      }

      return sale
    } catch (error) {
      return this.handleServiceError('findById', error, { id, businessId })
    }
  }

  async findByNumber(saleNumber: string, businessId: string) {
    try {
      const sale = await this.findSaleDetailBy('sale.sale_number = :saleNumber', {
        saleNumber,
        businessId,
      })

      if (!sale) {
        throw new AppNotFoundException(
          await this.i18n.translate('errors.sale_not_found'),
          'SALE_NOT_FOUND',
        )
      }

      return sale
    } catch (error) {
      return this.handleServiceError('findByNumber', error, { saleNumber, businessId })
    }
  }

  /**
   * Range sales summary (revenue/transactions/basket/units/refunds) for the period filter,
   * matching the desktop sales.summary. COMPLETED sales count as revenue; VOIDED = refunds.
   */
  async getRangeSummary(
    businessId: string,
    query: { customerId?: string | null; dateFrom?: string; dateTo?: string },
  ): Promise<SalesSummary> {
    try {
      // Financial revenue summary → bucket by the accounting posting day (BIZ-5.4), falling back to
      // business_date then sale_date for pre-migration history.
      const day = 'COALESCE(s.posting_date, s.business_date, s.sale_date)'
      const params: unknown[] = [businessId]
      const conds = ['s.business_id = $1', 's.deleted_at IS NULL']
      if (query.customerId) {
        params.push(query.customerId)
        conds.push(`s.customer_id = $${params.length}`)
      }
      if (query.dateFrom) {
        params.push(query.dateFrom)
        conds.push(`${day} >= $${params.length}`)
      }
      if (query.dateTo) {
        params.push(query.dateTo)
        conds.push(`${day} <= $${params.length}`)
      }
      const where = conds.join(' AND ')
      const mgr = this.salesRepo.manager
      // Net of the period's returns (ruling R19); voids and returns are the "refunds".
      const statuses = PROFIT_SALE_STATUSES.map((status) => `'${status}'`).join(', ')
      const [tot] = (await mgr.query(
        `SELECT COALESCE(SUM(s.total_amount), 0) AS revenue, COUNT(*)::int AS txns
         FROM sales s WHERE ${where} AND s.status IN (${statuses})`,
        params,
      )) as Array<{ revenue: string; txns: number }>
      const [units] = (await mgr.query(
        `SELECT COALESCE(SUM(si.quantity), 0) AS units
         FROM sale_items si JOIN sales s ON s.id = si.sale_id
         WHERE ${where} AND s.status IN (${statuses}) AND si.deleted_at IS NULL`,
        params,
      )) as Array<{ units: string }>
      const [ref] = (await mgr.query(
        `SELECT COUNT(*)::int AS n, COALESCE(SUM(s.total_amount), 0) AS amt
         FROM sales s WHERE ${where} AND s.status = 'VOIDED'`,
        params,
      )) as Array<{ n: number; amt: string }>
      const [biz] = (await mgr.query(`SELECT currency FROM businesses WHERE id = $1`, [
        businessId,
      ])) as Array<{
        currency: string | null
      }>
      const returned = await loadPeriodReturnLines(mgr, businessId, query)

      return {
        ...netSalesSummary({
          soldRevenue: Number(tot?.revenue ?? 0),
          transactions: Number(tot?.txns ?? 0),
          soldUnits: Number(units?.units ?? 0),
          returns: returnTotals(returned),
          voids: { count: Number(ref?.n ?? 0), amount: Number(ref?.amt ?? 0) },
        }),
        currency: biz?.currency ?? 'XAF',
      }
    } catch (error) {
      return this.handleServiceError('getRangeSummary', error, { businessId })
    }
  }

  /**
   * Daily sales series (one row per calendar day) for the Daily Sales Summary report.
   * Aggregates live from `sales` + `sale_payments` grouped by the `sale_date` column (the
   * same column the desktop groups by), so a fully-synced desktop and the cloud return
   * identical rows. `total` = SUM(total_amount) for COMPLETED sales; the payment split
   * (cash / momo=MTN+Orange / card) comes from sale_payments; `credit` = SUM(credit_amount).
   */
  async getDailySeries(
    businessId: string,
    query: { dateFrom?: string; dateTo?: string },
  ): Promise<DailySalesRow[]> {
    try {
      // BIZ-5.1: bucket by the local trading day (business_date), falling back to the UTC
      // sale_date for pre-migration rows that were never stamped.
      const day = 'COALESCE(s.business_date, s.sale_date)'
      const params: unknown[] = [businessId]
      const conds = ['s.business_id = $1', 's.deleted_at IS NULL']
      if (query.dateFrom) {
        params.push(query.dateFrom)
        conds.push(`${day} >= $${params.length}`)
      }
      if (query.dateTo) {
        params.push(query.dateTo)
        conds.push(`${day} <= $${params.length}`)
      }
      const where = conds.join(' AND ')
      const statuses = PROFIT_SALE_STATUSES.map((status) => `'${status}'`).join(', ')
      // Refund payments are left out here and taken off the day they were paid (ruling R19).
      const rows = (await this.salesRepo.manager.query(
        `SELECT d.bday::text AS date, d.txns, d.total, d.credit,
                COALESCE(p.cash, 0) AS cash, COALESCE(p.momo, 0) AS momo, COALESCE(p.card, 0) AS card
         FROM (
           SELECT ${day} AS bday, COUNT(*)::int AS txns,
                  COALESCE(SUM(s.total_amount), 0) AS total,
                  COALESCE(SUM(s.credit_amount), 0) AS credit
           FROM sales s WHERE ${where} AND s.status IN (${statuses})
           GROUP BY ${day}
         ) d
         LEFT JOIN (
           SELECT ${day} AS bday,
                  SUM(CASE WHEN sp.method = 'CASH' THEN sp.amount ELSE 0 END) AS cash,
                  SUM(CASE WHEN sp.method IN ('MTN_MOMO','ORANGE_MONEY') THEN sp.amount ELSE 0 END) AS momo,
                  SUM(CASE WHEN sp.method = 'CARD' THEN sp.amount ELSE 0 END) AS card
           FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id
           WHERE ${where} AND s.status IN (${statuses}) AND sp.kind <> 'REFUND'
           GROUP BY ${day}
         ) p ON p.bday = d.bday
         ORDER BY d.bday ASC`,
        params,
      )) as Array<{
        date: string
        txns: number
        total: string
        credit: string
        cash: string
        momo: string
        card: string
      }>

      const refundDay = `(COALESCE(sp.recorded_at, sp.created_at) AT TIME ZONE 'UTC')::date`
      const refundParams: unknown[] = [businessId]
      const refundConds: string[] = []
      if (query.dateFrom) {
        refundParams.push(query.dateFrom)
        refundConds.push(`${refundDay} >= $${refundParams.length}`)
      }
      if (query.dateTo) {
        refundParams.push(query.dateTo)
        refundConds.push(`${refundDay} <= $${refundParams.length}`)
      }
      const refundPayments = (await this.salesRepo.manager.query(
        `SELECT (${refundDay})::text AS date,
                SUM(CASE WHEN sp.method = 'CASH' THEN sp.amount ELSE 0 END) AS cash,
                SUM(CASE WHEN sp.method IN ('MTN_MOMO','ORANGE_MONEY') THEN sp.amount ELSE 0 END) AS momo,
                SUM(CASE WHEN sp.method = 'CARD' THEN sp.amount ELSE 0 END) AS card
         FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id
         WHERE s.business_id = $1 AND s.deleted_at IS NULL AND s.status <> 'VOIDED'
           AND sp.kind = 'REFUND'${refundConds.length ? ` AND ${refundConds.join(' AND ')}` : ''}
         GROUP BY ${refundDay}`,
        refundParams,
      )) as Array<{ date: string; cash: string; momo: string; card: string }>
      const returned = await loadPeriodReturnLines(this.salesRepo.manager, businessId, query)

      return netDailySales({
        sold: rows.map((r) => ({
          date: String(r.date).slice(0, 10),
          transactions: Number(r.txns ?? 0),
          total: Number(r.total ?? 0),
          cash: Number(r.cash ?? 0),
          momo: Number(r.momo ?? 0),
          card: Number(r.card ?? 0),
          credit: Number(r.credit ?? 0),
        })),
        returns: returnTotalsBy(returned, (line) => line.day),
        refundPayments: refundPayments.map((r) => ({
          date: String(r.date).slice(0, 10),
          cash: Number(r.cash ?? 0),
          momo: Number(r.momo ?? 0),
          card: Number(r.card ?? 0),
        })),
      })
    } catch (error) {
      return this.handleServiceError('getDailySeries', error, { businessId })
    }
  }

  /**
   * Cashier performance roster (one row per cashier) for the Cashier Performance report.
   * Aggregates live from `sales` grouped by cashier over the `sale_date` range — mirrors the
   * desktop cashierRoster exactly (shifts = distinct trading days; refunds = VOIDED sale
   * totals; discounts = sale-level discount_amount) so both sides tie out when synced.
   */
  async getCashierRoster(
    businessId: string,
    query: { dateFrom?: string; dateTo?: string },
  ): Promise<CashierPerformanceRow[]> {
    try {
      // BIZ-5.1: trading day = business_date (fallback sale_date). "shifts" = distinct days.
      const day = 'COALESCE(s.business_date, s.sale_date)'
      const params: unknown[] = [businessId]
      const conds = ['s.business_id = $1', 's.deleted_at IS NULL']
      if (query.dateFrom) {
        params.push(query.dateFrom)
        conds.push(`${day} >= $${params.length}`)
      }
      if (query.dateTo) {
        params.push(query.dateTo)
        conds.push(`${day} <= $${params.length}`)
      }
      const where = conds.join(' AND ')
      // Sold = the profit statuses; returns come off the selling cashier on the day of the
      // return (ruling R19). Discounts count as given, whatever was returned later.
      const sold = `s.status IN (${PROFIT_SALE_STATUSES.map((status) => `'${status}'`).join(', ')})`
      const rows = (await this.salesRepo.manager.query(
        `SELECT s.cashier_id AS "cashierId", COALESCE(u.name, '') AS name,
                COUNT(DISTINCT CASE WHEN ${sold} THEN ${day} END)::int AS shifts,
                COUNT(CASE WHEN ${sold} THEN 1 END)::int AS transactions,
                COALESCE(SUM(CASE WHEN ${sold} THEN s.total_amount ELSE 0 END), 0) AS sales,
                COALESCE(SUM(CASE WHEN s.status = 'VOIDED' THEN s.total_amount ELSE 0 END), 0) AS refunds,
                COALESCE(SUM(CASE WHEN ${sold} THEN s.discount_amount ELSE 0 END), 0) AS discounts
         FROM sales s LEFT JOIN users u ON u.id = s.cashier_id
         WHERE ${where}
         GROUP BY s.cashier_id, u.name`,
        params,
      )) as Array<{
        cashierId: string
        name: string
        shifts: number
        transactions: number
        sales: string
        refunds: string
        discounts: string
      }>
      const returned = await loadPeriodReturnLines(this.salesRepo.manager, businessId, query)
      return netCashierRoster(
        rows.map((r) => ({
          cashierId: r.cashierId,
          name: r.name || '—',
          shifts: Number(r.shifts ?? 0),
          transactions: Number(r.transactions ?? 0),
          sales: Number(r.sales ?? 0),
          refunds: Number(r.refunds ?? 0),
          discounts: Number(r.discounts ?? 0),
        })),
        returnsByCashier(returned),
      )
    } catch (error) {
      return this.handleServiceError('getCashierRoster', error, { businessId })
    }
  }

  private rangeWhere(
    query: { dateFrom?: string; dateTo?: string },
    grain: 'operational' | 'financial' = 'operational',
  ): {
    where: string
    params: unknown[]
  } {
    // Operational reports range by the local trading day (business_date, BIZ-5.1). Financial reports
    // range by the accounting posting day (posting_date, BIZ-5.4) so a closed period never shifts.
    const day =
      grain === 'financial'
        ? 'COALESCE(s.posting_date, s.business_date, s.sale_date)'
        : 'COALESCE(s.business_date, s.sale_date)'
    const params: unknown[] = []
    const conds = ['s.business_id = $1', 's.deleted_at IS NULL']
    params.push('')
    if (query.dateFrom) {
      params.push(query.dateFrom)
      conds.push(`${day} >= $${params.length}`)
    }
    if (query.dateTo) {
      params.push(query.dateTo)
      conds.push(`${day} <= $${params.length}`)
    }
    return { where: conds.join(' AND '), params }
  }

  /**
   * Sales by product (per-product revenue / COGS / margin, ranked by revenue) for the report.
   * Aggregates `sale_items` for COMPLETED sales in the `sale_date` range, joining the product
   * category — identical logic + columns to the desktop getSalesByProduct so both tie out.
   */
  async getSalesByProduct(
    businessId: string,
    query: { dateFrom?: string; dateTo?: string },
  ): Promise<SalesByProductRow[]> {
    try {
      // Financial (gross-profit-by-product) → range by posting_date (BIZ-5.4). Net of the
      // period's refunds (ruling R4): the netting is @biztrack/domain's netSalesByProduct.
      const { where, params } = this.rangeWhere(query, 'financial')
      params[0] = businessId
      const statuses = PROFIT_SALE_STATUSES.map((status) => `'${status}'`).join(', ')
      const sold = (await this.salesRepo.manager.query(
        `SELECT si.product_id AS "productId", si.product_name AS name, c.name AS category,
                COALESCE(SUM(si.quantity), 0) AS quantity,
                COALESCE(SUM(si.line_total), 0) AS revenue,
                COALESCE(SUM(COALESCE(si.cost_price, 0) * si.quantity), 0) AS cogs
         FROM sale_items si
           JOIN sales s ON s.id = si.sale_id
           LEFT JOIN products p ON p.id = si.product_id
           LEFT JOIN product_categories c ON c.id = p.category_id
         WHERE ${where} AND s.status IN (${statuses}) AND si.deleted_at IS NULL
         GROUP BY si.product_id, si.product_name, c.name`,
        params,
      )) as Array<{
        productId: string
        name: string
        category: string | null
        quantity: string
        revenue: string
        cogs: string
      }>

      const returnDay = `COALESCE(r.business_date, (r.created_at AT TIME ZONE 'UTC')::date)`
      const returnParams: unknown[] = [businessId]
      const returnConds: string[] = []
      if (query.dateFrom) {
        returnParams.push(query.dateFrom)
        returnConds.push(`${returnDay} >= $${returnParams.length}`)
      }
      if (query.dateTo) {
        returnParams.push(query.dateTo)
        returnConds.push(`${returnDay} <= $${returnParams.length}`)
      }
      const returned = (await this.salesRepo.manager.query(
        `SELECT r.id AS "returnId", r.restock AS restock, ri.quantity AS "returnedQuantity",
                si.quantity AS "soldQuantity", si.line_total AS "lineTotal",
                si.cost_price AS "costPrice", si.product_id AS "productId",
                si.product_name AS name, c.name AS category
         FROM sale_return_items ri
           JOIN sale_returns r ON r.id = ri.sale_return_id
           JOIN sale_items si ON si.id = ri.sale_item_id
           JOIN sales s ON s.id = r.sale_id
           LEFT JOIN products p ON p.id = si.product_id
           LEFT JOIN product_categories c ON c.id = p.category_id
         WHERE r.business_id = $1 AND s.deleted_at IS NULL AND s.status <> 'VOIDED'${
           returnConds.length ? ` AND ${returnConds.join(' AND ')}` : ''
         }`,
        returnParams,
      )) as Array<{
        returnId: string
        restock: boolean
        returnedQuantity: string
        soldQuantity: string
        lineTotal: string
        costPrice: string | null
        productId: string
        name: string
        category: string | null
      }>

      return netSalesByProduct(
        sold.map((r) => ({
          productId: r.productId,
          name: r.name,
          category: r.category ?? null,
          quantity: Number(r.quantity ?? 0),
          revenue: Number(r.revenue ?? 0),
          cogs: Number(r.cogs ?? 0),
        })),
        returned.map((r) => ({
          returnId: r.returnId,
          restock: Boolean(r.restock),
          returnedQuantity: Number(r.returnedQuantity),
          soldQuantity: Number(r.soldQuantity),
          lineTotal: Number(r.lineTotal),
          costPrice: r.costPrice === null ? null : Number(r.costPrice),
          productId: r.productId,
          name: r.name,
          category: r.category ?? null,
        })),
      )
    } catch (error) {
      return this.handleServiceError('getSalesByProduct', error, { businessId })
    }
  }

  /** Sales split by payment method (txns + amount per method) — mirrors the desktop. */
  async getSalesByPaymentMethod(
    businessId: string,
    query: { dateFrom?: string; dateTo?: string },
  ): Promise<SalesByPaymentRow[]> {
    try {
      // Money in by method, net of money handed back (ruling R4). Payments count on the
      // day of their sale; a refund comes off the day it was paid out. A refunded or partly
      // refunded sale still counts; a voided one never does.
      const { where, params } = this.rangeWhere(query)
      params[0] = businessId
      const statuses = PROFIT_SALE_STATUSES.map((status) => `'${status}'`).join(', ')
      const refundDay = `(COALESCE(sp.recorded_at, sp.created_at) AT TIME ZONE 'UTC')::date`
      const refundConds: string[] = []
      let index = 1
      if (query.dateFrom) refundConds.push(`${refundDay} >= $${++index}`)
      if (query.dateTo) refundConds.push(`${refundDay} <= $${++index}`)
      const rows = (await this.salesRepo.manager.query(
        `SELECT x.method AS method,
                COUNT(DISTINCT x.paid_sale_id)::int AS transactions,
                COALESCE(SUM(x.amount), 0) AS amount
         FROM (
           SELECT sp.method AS method, sp.sale_id AS paid_sale_id, sp.amount AS amount
           FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id
           WHERE ${where} AND s.status IN (${statuses}) AND sp.kind <> 'REFUND'
           UNION ALL
           SELECT sp.method AS method, NULL::uuid AS paid_sale_id, -sp.amount AS amount
           FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id
           WHERE s.business_id = $1 AND s.deleted_at IS NULL AND s.status <> 'VOIDED'
             AND sp.kind = 'REFUND'${refundConds.length ? ` AND ${refundConds.join(' AND ')}` : ''}
         ) x
         GROUP BY x.method
         ORDER BY amount DESC`,
        params,
      )) as Array<{ method: string; transactions: number; amount: string }>
      return rows.map((r) => ({
        method: r.method,
        transactions: Number(r.transactions ?? 0),
        amount: toWholeXaf(Number(r.amount ?? 0)),
      }))
    } catch (error) {
      return this.handleServiceError('getSalesByPaymentMethod', error, { businessId })
    }
  }

  /**
   * Refunds & returns: VOIDED sales grouped by void reason + by cashier, plus gross completed
   * sales (the refund-rate denominator). Mirrors the desktop getRefundsSummary.
   */
  async getRefundsSummary(
    businessId: string,
    query: { dateFrom?: string; dateTo?: string },
  ): Promise<{ byReason: RefundReasonRow[]; byCashier: RefundCashierRow[]; grossSales: number }> {
    try {
      const { where, params } = this.rangeWhere(query)
      params[0] = businessId
      // Voids and the period's returns together (ruling R19).
      const sold = `s.status IN (${PROFIT_SALE_STATUSES.map((status) => `'${status}'`).join(', ')})`
      const byReason = (await this.salesRepo.manager.query(
        `SELECT s.void_reason AS reason, COUNT(*)::int AS count, COALESCE(SUM(s.total_amount), 0) AS amount
         FROM sales s WHERE ${where} AND s.status = 'VOIDED'
         GROUP BY s.void_reason`,
        params,
      )) as Array<{ reason: string | null; count: number; amount: string }>
      const byCashier = (await this.salesRepo.manager.query(
        `SELECT s.cashier_id AS "cashierId", COALESCE(u.name, '') AS name,
                COALESCE(SUM(CASE WHEN s.status = 'VOIDED' THEN s.total_amount ELSE 0 END), 0) AS refunds,
                COALESCE(SUM(CASE WHEN ${sold} THEN s.total_amount ELSE 0 END), 0) AS sales
         FROM sales s LEFT JOIN users u ON u.id = s.cashier_id
         WHERE ${where}
         GROUP BY s.cashier_id, u.name`,
        params,
      )) as Array<{ cashierId: string; name: string; refunds: string; sales: string }>
      const [gross] = (await this.salesRepo.manager.query(
        `SELECT COALESCE(SUM(s.total_amount), 0) AS gross FROM sales s WHERE ${where} AND ${sold}`,
        params,
      )) as Array<{ gross: string }>
      const returned = await loadPeriodReturnLines(this.salesRepo.manager, businessId, query)
      return refundsReport({
        voidsByReason: byReason.map((r) => ({
          reason: r.reason ?? null,
          count: Number(r.count ?? 0),
          amount: Number(r.amount ?? 0),
        })),
        returnsByReason: returnTotalsBy(returned, (line) => line.reason),
        voidsByCashier: byCashier.map((r) => ({
          cashierId: r.cashierId,
          name: r.name || '—',
          refunds: Number(r.refunds ?? 0),
          sales: Number(r.sales ?? 0),
        })),
        returnsByCashier: returnsByCashier(returned),
        grossSales: Number(gross?.gross ?? 0),
      })
    } catch (error) {
      return this.handleServiceError('getRefundsSummary', error, { businessId })
    }
  }

  /** Product revenue (Σ line totals) + COGS (Σ cost×qty) for completed sales — feeds the P&L. */
  async getGrossProfit(
    businessId: string,
    query: { dateFrom?: string; dateTo?: string },
  ): Promise<{ revenue: number; cogs: number }> {
    try {
      // Financial (feeds the P&L) → ranged by posting_date (BIZ-5.4). Net of the refunds made
      // in the period (ruling R4); the rule is @biztrack/domain's.
      const { revenue, cogs } = await loadNetSalesProfit(this.salesRepo.manager, businessId, query)
      return { revenue, cogs }
    } catch (error) {
      return this.handleServiceError('getGrossProfit', error, { businessId })
    }
  }

  async void(
    id: string,
    businessId: string,
    user: JwtPayload,
    dto: VoidSaleDto,
    context?: AuditContext,
  ) {
    try {
      if (!staffMay(user.role, 'SALE_VOID')) {
        throw new AppForbiddenException(
          await this.i18n.translate('errors.sales_void_forbidden'),
          'FORBIDDEN',
        )
      }

      await this.dataSource.transaction(async (manager) => {
        const sale = await this.findSaleDetailBy('sale.id = :id', { id, businessId }, manager)

        if (!sale) {
          throw new AppNotFoundException(
            await this.i18n.translate('errors.sale_not_found'),
            'SALE_NOT_FOUND',
          )
        }

        // A void cancels what is still sold (@biztrack/domain): a partly refunded sale is
        // voided only for the balance left after its refunds, and a fully refunded sale
        // cannot be voided at all.
        const voidDecision = await this.decideVoid(manager, sale)
        if (!voidDecision.ok) {
          throw voidDecision.code === 'FULLY_REFUNDED'
            ? new AppBadRequestException(
                'A fully refunded sale cannot be voided.',
                'SALE_FULLY_REFUNDED',
              )
            : new AppBadRequestException(
                await this.i18n.translate('errors.already_voided', {
                  args: { saleNumber: sale.saleNumber },
                }),
                'ALREADY_VOIDED',
              )
        }
        const voidLines = this.voidedItems(sale.items ?? [], voidDecision.lines)

        const saleRepo = manager.getRepository(Sale)
        await saleRepo.update(sale.id, {
          status: SaleStatus.VOIDED,
          voidedAt: new Date(),
          voidedById: user.sub,
          voidReason: dto.reason.trim(),
        })

        await this.inventoryService.reverseForVoidedSale(
          businessId,
          sale.id,
          sale.saleNumber,
          user.sub,
          await this.expandSaleItemsForInventory(
            manager,
            businessId,
            voidLines.map(({ item, quantity }) => ({
              productId: item.productId,
              variantId: item.variantId ?? null,
              productName: item.productName,
              quantity,
            })),
          ),
          manager,
        )

        await this.releaseSerialUnitsForVoid(
          manager,
          businessId,
          voidLines.map(({ item }) => item),
        )

        await this.dailySummaryService.decrementForVoid(
          sale,
          sale.items ?? [],
          sale.payments ?? [],
          manager,
          voidDecision.balance,
        )

        await this.debtsService.writeOffSourceDebt(manager, {
          businessId,
          sourceType: DebtSource.SALE,
          sourceId: sale.id,
          reason: `Sale ${sale.saleNumber} was voided: ${dto.reason.trim()}`,
          writtenOffAt: new Date(),
          writtenOffById: user.sub,
        })

        // Refund any deposit (savings) used to pay this sale. This is the direct-API
        // (cloud) counterpart to what the desktop does locally before syncing — mirrors
        // how create() draws savings here while createFromSync leaves it to the client.
        // The sync void path (applyVoidFromSync) must NOT repeat this, or deposits would
        // be refunded twice.
        for (const payment of sale.payments ?? []) {
          if (payment.method === PaymentMethod.SAVINGS && payment.savingsAccountId) {
            await this.savingsService.createVoidedSaleTransaction(
              businessId,
              payment.savingsAccountId,
              sale.id,
              payment.amount,
              new Date(),
            )
          }
        }
      })

      const result = await this.findById(id, businessId)
      if (context) {
        this.auditService.log(context, {
          action: 'SALE_VOIDED',
          entityType: 'sale',
          entityId: id,
          entityLabel: result.saleNumber,
          amount: result.totalAmount,
          changes: {
            before: { status: 'COMPLETED' },
            after: { status: 'VOIDED', voidReason: dto.reason.trim() },
          },
        })
      }
      return result
    } catch (error) {
      return this.handleServiceError('void', error, { id, businessId, userId: user.sub })
    }
  }

  /**
   * Append a signed PAYMENT to a sale's ledger (COD collection, deposit top-up). Recomputes
   * amountPaid/creditAmount from the full ledger and settles any outstanding receivable.
   * Idempotent by payment id. Phase 1 primitive — see docs/online-order-sale-flow-*.md.
   */
  async recordPayment(
    id: string,
    businessId: string,
    user: JwtPayload,
    input: RecordSalePaymentInput,
  ) {
    try {
      await this.dataSource.transaction(async (manager) => {
        const sale = await this.findSaleDetailBy('sale.id = :id', { id, businessId }, manager)
        if (!sale) {
          throw new AppNotFoundException(
            await this.i18n.translate('errors.sale_not_found'),
            'SALE_NOT_FOUND',
          )
        }
        if (sale.status === SaleStatus.VOIDED) {
          throw new AppBadRequestException(
            await this.i18n.translate('errors.already_voided', {
              args: { saleNumber: sale.saleNumber },
            }),
            'ALREADY_VOIDED',
          )
        }

        const amount = toWholeXaf(input.amount)
        if (amount <= 0) {
          throw new AppBadRequestException(
            'Payment amount must be positive.',
            'INVALID_PAYMENT_AMOUNT',
          )
        }

        const paymentRepo = manager.getRepository(SalePayment)
        const paymentId = input.id ?? randomUUID()
        const existing = await paymentRepo.findOne({ where: { id: paymentId } })
        if (existing) return // idempotent replay

        const now = new Date()
        await paymentRepo.save(
          paymentRepo.create({
            id: paymentId,
            saleId: sale.id,
            businessId,
            method: input.method,
            amount,
            mobileMoneyReference: input.mobileMoneyReference?.trim() || null,
            kind: SalePaymentKind.PAYMENT,
            recordedAt: now,
            // Empty for a system/guest actor (a payment-link settlement with no user) → NULL, since
            // recorded_by_id is a uuid column that rejects an empty string.
            recordedById: user.sub || null,
            note: input.note?.trim() || null,
          }),
        )

        const settlement = await this.recomputeSaleSettlement(manager, sale.id, sale.totalAmount)
        await manager.getRepository(Sale).update(sale.id, {
          amountPaid: settlement.amountPaid,
          creditAmount: settlement.creditAmount,
        })

        // Settle the sale's receivable (COD) if one is open — capped at outstanding.
        await this.debtsService.settleSourcePayment(manager, {
          businessId,
          direction: DebtDirection.RECEIVABLE,
          sourceType: DebtSource.SALE,
          sourceId: sale.id,
          amount,
          method: input.method,
          mobileMoneyReference: input.mobileMoneyReference ?? null,
          paymentDate: input.paymentDate,
          recordedById: user.sub || null,
        })
      })
      return this.findById(id, businessId)
    } catch (error) {
      return this.handleServiceError('recordPayment', error, { id, businessId, userId: user.sub })
    }
  }

  /**
   * Refund/return a sale (full or partial). Appends a signed REFUND ledger row for the money
   * returned (capped at amountPaid), writes a sale_returns record + returned lines, optionally
   * restocks inventory + releases serial units, and cancels any outstanding receivable on a full
   * return. Sets status REFUNDED (full) or PARTIALLY_REFUNDED (partial). Phase 1 primitive.
   */
  async refund(id: string, businessId: string, user: JwtPayload, input: RefundSaleInput) {
    try {
      if (!staffMay(user.role, 'SALE_REFUND')) {
        throw new AppForbiddenException(
          await this.i18n.translate('errors.staff_action_forbidden'),
          'STAFF_ACTION_FORBIDDEN',
        )
      }
      await this.dataSource.transaction(async (manager) => {
        const sale = await this.findSaleDetailBy('sale.id = :id', { id, businessId }, manager)
        if (!sale) {
          throw new AppNotFoundException(
            await this.i18n.translate('errors.sale_not_found'),
            'SALE_NOT_FOUND',
          )
        }
        if (sale.status === SaleStatus.VOIDED) {
          throw new AppBadRequestException('A voided sale cannot be refunded.', 'SALE_VOIDED')
        }

        const saleItems = sale.items ?? []
        // What comes back, what it is worth and what money is returned is decided by
        // @biztrack/domain (the same decision desktop makes offline).
        const returnedBefore = await this.returnedQuantityByItem(manager, sale.id)
        // What the customer still owes on the sale: returned goods reduce it before any
        // money is handed back (ruling R10).
        const owed = await this.debtsService.sourceDebtBalance(manager, {
          businessId,
          sourceType: DebtSource.SALE,
          sourceId: sale.id,
        })
        const decision = decideSaleRefund({
          items: saleItems.map((item) => ({
            id: item.id,
            quantity: item.quantity,
            lineTotal: item.lineTotal,
            returnedQuantity: returnedBefore.get(item.id) ?? 0,
          })),
          returns: input.items,
          requestedAmount: input.amount,
          amountPaid: sale.amountPaid + owed.paid,
          outstandingBalance: owed.outstanding,
        })
        if (!decision.ok) {
          throw decision.code === 'RETURN_ITEM_NOT_FOUND'
            ? new AppBadRequestException(
                'Returned line does not belong to this sale.',
                'RETURN_ITEM_NOT_FOUND',
              )
            : new AppBadRequestException('Select at least one item to return.', 'NOTHING_TO_RETURN')
        }
        const returnedLines = decision.lines.map((line) => {
          const item = saleItems.find((si) => si.id === line.saleItemId)!
          const requested = line.requestIndex === null ? null : input.items?.[line.requestIndex]
          return {
            item,
            quantity: line.quantity,
            serialUnitId: requested?.serialUnitId ?? item.serialUnitId ?? null,
          }
        })
        const isFullReturn = decision.isFullReturn
        const moneyRefund = decision.refundAmount
        const restock = input.restock !== false
        const now = new Date()

        const returnId = randomUUID()
        const returnRepo = manager.getRepository(SaleReturn)
        // The refund is booked on the trading day it is made, not the day of the sale.
        const returnBusinessDate = await this.calendar.businessDateFor(businessId, now, null)
        await returnRepo.save(
          returnRepo.create({
            id: returnId,
            saleId: sale.id,
            businessId,
            businessDate: returnBusinessDate,
            onlineOrderId: sale.onlineOrderId ?? null,
            reason: input.reason?.trim() || null,
            restock,
            refundAmount: moneyRefund,
            createdById: user.sub,
          }),
        )
        const returnItemRepo = manager.getRepository(SaleReturnItem)
        await returnItemRepo.save(
          returnedLines.map((r) =>
            returnItemRepo.create({
              id: randomUUID(),
              saleReturnId: returnId,
              businessId,
              saleItemId: r.item.id,
              quantity: r.quantity,
              serialUnitId: r.serialUnitId ?? null,
            }),
          ),
        )

        if (moneyRefund > 0) {
          await manager.getRepository(SalePayment).save(
            manager.getRepository(SalePayment).create({
              id: randomUUID(),
              saleId: sale.id,
              businessId,
              method: (sale.paymentMethod as PaymentMethod) ?? PaymentMethod.CASH,
              amount: moneyRefund,
              kind: SalePaymentKind.REFUND,
              recordedAt: now,
              recordedById: user.sub,
              note: input.reason?.trim() || 'Refund',
            }),
          )
        }

        if (restock) {
          await this.inventoryService.reverseForVoidedSale(
            businessId,
            sale.id,
            sale.saleNumber,
            user.sub,
            await this.expandSaleItemsForInventory(
              manager,
              businessId,
              returnedLines.map((r) => ({
                productId: r.item.productId,
                variantId: r.item.variantId ?? null,
                productName: r.item.productName,
                quantity: r.quantity,
              })),
            ),
            manager,
          )
          await this.releaseSerialUnitsForVoid(
            manager,
            businessId,
            returnedLines
              .filter((r) => r.serialUnitId)
              .map((r) => ({ serialUnitId: r.serialUnitId })),
          )
        }

        // The refund comes off today's revenue and, for restocked goods, cost (ruling R4).
        await this.dailySummaryService.applyRefund(
          businessId,
          now.toISOString().slice(0, 10),
          refundProfitImpact({
            restock,
            lines: returnedLines.map((r) => ({
              returnedQuantity: r.quantity,
              soldQuantity: r.item.quantity,
              lineTotal: r.item.lineTotal,
              costPrice: r.item.costPrice ?? null,
            })),
          }),
          manager,
        )

        const settlement = await this.recomputeSaleSettlement(manager, sale.id, sale.totalAmount)
        await manager.getRepository(Sale).update(sale.id, {
          amountPaid: settlement.amountPaid,
          creditAmount: settlement.creditAmount,
          status: decision.status,
        })

        // A partial return takes the goods off what is still owed (ruling R10).
        if (!isFullReturn) {
          await this.debtsService.reduceSourceDebt(manager, {
            businessId,
            sourceType: DebtSource.SALE,
            sourceId: sale.id,
            amount: decision.debtReduction,
          })
        }

        // A full return cancels any outstanding receivable — the goods came back.
        if (isFullReturn) {
          await this.debtsService.writeOffSourceDebt(manager, {
            businessId,
            sourceType: DebtSource.SALE,
            sourceId: sale.id,
            reason: `Sale ${sale.saleNumber} returned: ${input.reason?.trim() ?? 'refund'}`,
            writtenOffAt: now,
            writtenOffById: user.sub,
          })
        }
      })
      return this.findById(id, businessId)
    } catch (error) {
      return this.handleServiceError('refund', error, { id, businessId, userId: user.sub })
    }
  }

  /** Load what a void needs and let @biztrack/domain decide it. */
  private async decideVoid(manager: EntityManager, sale: Sale) {
    const returnedBefore = await this.returnedQuantityByItem(manager, sale.id)
    const refunded = await loadSaleRefundImpact(manager, sale.id)
    return decideSaleVoid({
      status: sale.status,
      items: (sale.items ?? []).map((item) => ({
        id: item.id,
        quantity: item.quantity,
        lineTotal: item.lineTotal,
        costPrice: item.costPrice ?? null,
        returnedQuantity: returnedBefore.get(item.id) ?? 0,
      })),
      refundedRevenue: refunded.revenue,
    })
  }

  /** Pair each voided line with its sale item. */
  private voidedItems(items: SaleItem[], lines: Array<{ saleItemId: string; quantity: number }>) {
    return lines.map((line) => ({
      item: items.find((item) => item.id === line.saleItemId)!,
      quantity: line.quantity,
    }))
  }

  /** Quantity already returned per sale item, across every return recorded for the sale. */
  private async returnedQuantityByItem(
    manager: EntityManager,
    saleId: string,
  ): Promise<Map<string, number>> {
    const rows = await manager
      .getRepository(SaleReturnItem)
      .createQueryBuilder('returnItem')
      .innerJoin(SaleReturn, 'saleReturn', 'saleReturn.id = returnItem.saleReturnId')
      .where('saleReturn.saleId = :saleId', { saleId })
      .select('returnItem.saleItemId', 'saleItemId')
      .addSelect('SUM(returnItem.quantity)', 'quantity')
      .groupBy('returnItem.saleItemId')
      .getRawMany<{ saleItemId: string; quantity: string | number }>()
    return new Map(rows.map((row) => [row.saleItemId, Number(row.quantity)]))
  }

  /** Recompute a sale's paid/credit from its signed payment ledger: Σ(PAYMENT) − Σ(REFUND). */
  private async recomputeSaleSettlement(
    manager: EntityManager,
    saleId: string,
    totalAmount: number,
  ): Promise<{ amountPaid: number; creditAmount: number }> {
    const entries = await manager.getRepository(SalePayment).find({ where: { saleId } })
    // Goods that came back are no longer owed for (ruling R9).
    const returned = await loadSaleRefundImpact(manager, saleId)
    return settleSaleFromLedger({ totalAmount, entries, returnedGoodsValue: returned.revenue })
  }

  async getDailySummary(businessId: string, date?: string): Promise<DailySalesSummary> {
    try {
      const targetDate = date ?? new Date().toISOString().slice(0, 10)
      const summary = await this.dailySummaryService.findByDate(businessId, targetDate)

      if (!summary) {
        return {
          date: targetDate,
          totalSales: 0,
          totalRevenue: 0,
          totalCost: 0,
          grossProfit: 0,
          grossMarginPercent: 0,
          totalDiscounts: 0,
          cashCollected: 0,
          mtnMomoCollected: 0,
          orangeMoneyCollected: 0,
          cardCollected: 0,
          creditIssued: 0,
          creditSales: 0,
          voidedSales: 0,
          voidedAmount: 0,
        }
      }

      return {
        date: summary.summaryDate,
        totalSales: summary.totalSales,
        totalRevenue: summary.totalRevenue,
        totalCost: summary.totalCost,
        grossProfit: summary.grossProfit,
        grossMarginPercent:
          summary.totalRevenue > 0
            ? toWholeXaf((summary.grossProfit / summary.totalRevenue) * 100)
            : 0,
        totalDiscounts: summary.totalDiscounts,
        cashCollected: summary.cashCollected,
        mtnMomoCollected: summary.mtnMomoCollected,
        orangeMoneyCollected: summary.orangeMoneyCollected,
        cardCollected: summary.cardCollected,
        creditIssued: summary.creditIssued,
        creditSales: summary.creditSales,
        voidedSales: summary.voidedSales,
        voidedAmount: summary.voidedAmount,
      }
    } catch (error) {
      return this.handleServiceError('getDailySummary', error, { businessId, date })
    }
  }

  async getCashierShiftSummary(
    businessId: string,
    cashierId: string,
    date: string,
  ): Promise<CashierShiftSummary> {
    try {
      const sales = await this.salesRepo
        .createQueryBuilder('sale')
        .leftJoinAndSelect('sale.items', 'items')
        .leftJoinAndSelect('sale.payments', 'payments')
        .leftJoinAndSelect('sale.cashier', 'cashier')
        .where('sale.business_id = :businessId', { businessId })
        .andWhere('sale.cashier_id = :cashierId', { cashierId })
        // BIZ-5.1: match the cashier's trading day (business_date, fallback sale_date).
        .andWhere('COALESCE(sale.business_date, sale.sale_date) = :date', { date })
        .orderBy('sale.sold_at', 'DESC')
        .getMany()

      if (sales.length === 0) {
        return {
          cashierId,
          cashierName: null,
          date,
          shiftRevenue: 0,
          transactionCount: 0,
          avgOrderValue: 0,
          voidCount: 0,
          voidAmount: 0,
          hourlyCounts: [],
          topItems: [],
          paymentSplit: [],
          recentActivity: [],
        }
      }

      const cashierName = sales[0]?.cashier?.name ?? null
      let shiftRevenue = 0
      let transactionCount = 0
      let voidCount = 0
      let voidAmount = 0
      const hourlyMap = new Map<number, number>()
      const productMap = new Map<string, { productName: string; quantity: number }>()
      const paymentMap = new Map<string, number>()
      const recentActivity: CashierShiftSummary['recentActivity'] = []

      for (const sale of sales) {
        const saleTotal = sale.totalAmount
        const isVoid = sale.status === SaleStatus.VOIDED
        const isCompleted = sale.status === SaleStatus.COMPLETED

        if (isVoid) {
          voidCount += 1
          voidAmount = toWholeXaf(voidAmount + saleTotal)
        } else if (isCompleted) {
          transactionCount += 1
          shiftRevenue = toWholeXaf(shiftRevenue + saleTotal)

          const hour = new Date(sale.soldAt).getHours()
          hourlyMap.set(hour, (hourlyMap.get(hour) ?? 0) + 1)

          for (const item of sale.items ?? []) {
            const existing = productMap.get(item.productId)
            if (existing) {
              existing.quantity += item.quantity
            } else {
              productMap.set(item.productId, {
                productName: item.productName,
                quantity: item.quantity,
              })
            }
          }

          for (const payment of sale.payments ?? []) {
            paymentMap.set(
              payment.method,
              toWholeXaf((paymentMap.get(payment.method) ?? 0) + payment.amount),
            )
          }
        }

        if (recentActivity.length < 15) {
          const items = sale.items ?? []
          const parts = items.slice(0, 3).map((item) => {
            const qty = Number.isInteger(item.quantity)
              ? item.quantity
              : parseFloat(item.quantity.toFixed(2))
            return `${item.productName} × ${qty}`
          })
          if (items.length > 3) parts.push(`+${items.length - 3}`)

          recentActivity.push({
            id: sale.id,
            saleNumber: sale.saleNumber,
            type: isVoid ? 'void' : 'sale',
            totalAmount: toWholeXaf(saleTotal),
            soldAt: sale.soldAt.toISOString(),
            voidedAt: sale.voidedAt?.toISOString() ?? null,
            voidReason: sale.voidReason ?? null,
            itemSummary: parts.join(', '),
            customerName: sale.customerName ?? null,
          })
        }
      }

      const hourlyCounts = Array.from(hourlyMap.entries())
        .map(([hour, count]) => ({ hour, count }))
        .sort((a, b) => a.hour - b.hour)

      const topItems = Array.from(productMap.entries())
        .map(([productId, { productName, quantity }]) => ({ productId, productName, quantity }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 5)

      const paymentSplit = Array.from(paymentMap.entries())
        .map(([method, amount]) => ({ method, amount }))
        .sort((a, b) => b.amount - a.amount)

      return {
        cashierId,
        cashierName,
        date,
        shiftRevenue,
        transactionCount,
        avgOrderValue: transactionCount > 0 ? toWholeXaf(shiftRevenue / transactionCount) : 0,
        voidCount,
        voidAmount,
        hourlyCounts,
        topItems,
        paymentSplit,
        recentActivity,
      }
    } catch (error) {
      return this.handleServiceError('getCashierShiftSummary', error, {
        businessId,
        cashierId,
        date,
      })
    }
  }

  async getReceipt(id: string, businessId: string) {
    try {
      const [sale, business] = await Promise.all([
        this.findById(id, businessId),
        this.businessesRepo.findOne({ where: { id: businessId } }),
      ])

      if (!business) {
        throw new AppNotFoundException(
          await this.i18n.translate('errors.business_not_found'),
          'BUSINESS_NOT_FOUND',
        )
      }

      return {
        sale,
        business,
      }
    } catch (error) {
      return this.handleServiceError('getReceipt', error, { id, businessId })
    }
  }

  /**
   * Public digital receipt (the QR on the printed receipt points here). Unauthenticated: the sale id
   * (an unguessable UUID) is the capability. Renders the shared receipt template with the business's
   * own receipt settings (identity, NIU, logo, paper width, content toggles) — the same one that
   * prints — minus the QR (no recursion). Returns null when the sale doesn't exist.
   */
  async renderPublicReceipt(saleId: string, locale = 'fr'): Promise<string | null> {
    const ref = await this.salesRepo.findOne({
      where: { id: saleId },
      select: ['id', 'businessId'],
    })
    if (!ref) return null
    const { sale, business } = await this.getReceipt(saleId, ref.businessId)
    return this.renderReceiptHtmlFor(sale, business, locale)
  }

  /**
   * Render the sale's receipt (shared @biztrack/templates template) to a PDF and dispatch
   * it to the customer over WhatsApp/email. Same pipeline as RFQ/PO sends (ProcurementSend).
   */
  async sendReceipt(
    id: string,
    businessId: string,
    dto: SendSaleReceiptDto,
    context?: AuditContext,
  ): Promise<{ pdfUrl: string | null }> {
    try {
      const { sale, business } = await this.getReceipt(id, businessId)
      const locale = dto.locale?.trim() || 'fr'
      const html = await this.renderReceiptHtmlFor(sale, business, locale)

      let phone = dto.recipient?.phone ?? sale.customerPhone ?? null
      let email = dto.recipient?.email ?? null
      if ((!email || !phone) && sale.customerId) {
        const contact = await this.contactsRepo.findOne({
          where: { id: sale.customerId, businessId },
        })
        email = email ?? contact?.email ?? null
        phone = phone ?? contact?.phone ?? null
      }

      const result = await this.procurementSend.dispatch({
        businessId,
        html,
        message: `${business.name} — ${sale.saleNumber}`,
        filename: `receipt-${sale.saleNumber}`,
        subject: `${business.name} — ${sale.saleNumber}`,
        channels: dto.channels,
        phone,
        email,
      })

      if (context) {
        this.auditService.log(context, {
          action: 'EXPORT',
          entityType: 'sale_receipt',
          entityId: sale.id,
          entityLabel: sale.saleNumber,
          changes: { before: null, after: { channels: dto.channels } },
        })
      }
      return result
    } catch (error) {
      return this.handleServiceError('sendReceipt', error, { id, businessId })
    }
  }

  private async loadProductsForSale(
    manager: EntityManager,
    businessId: string,
    dto: Pick<SaleComputationInput, 'items'>,
    /**
     * `allowUnavailableSerials`: accept a serial unit that is no longer available (already
     * sold elsewhere). Used for sales synced from an offline till (ruling R3); the conflict
     * is flagged when the unit is marked.
     */
    options?: { allowUnavailableSerials?: boolean },
  ) {
    const ids = [...new Set(dto.items.map((item) => item.productId))]
    const products = await manager.getRepository(Product).find({
      where: ids.map((id) => ({
        id,
        businessId,
        deletedAt: IsNull(),
      })),
      relations: ['unitOfMeasure'],
    })

    if (products.length !== ids.length) {
      throw new AppBadRequestException(
        await this.i18n.translate('errors.product_not_found'),
        'PRODUCT_NOT_FOUND',
      )
    }

    const productsById = new Map(products.map((product) => [product.id, product]))

    for (const product of products) {
      if (!product.isActive) {
        throw new AppBadRequestException(
          await this.i18n.translate('errors.product_inactive', {
            args: { name: product.name },
          }),
          'PRODUCT_INACTIVE',
        )
      }
    }

    // Load + validate variants (Phase 3D).
    const variantIds = [
      ...new Set(dto.items.map((item) => item.variantId).filter((id): id is string => Boolean(id))),
    ]
    const variants = variantIds.length
      ? await manager.getRepository(ProductVariant).find({
          where: { id: In(variantIds), businessId, deletedAt: IsNull() },
        })
      : []
    const variantsById = new Map(variants.map((variant) => [variant.id, variant]))

    for (const item of dto.items) {
      const product = productsById.get(item.productId)!
      // Serialised products carry their variant on the serial unit itself (the sell UI
      // picks a unit, not a variant), so the variant is derived + validated in the
      // serial-unit pass below. Only require an explicit variantId for non-serialised
      // variant products. Mirrors the desktop local rule (`hasVariants && !isSerialized`).
      if (product.hasVariants && !product.isSerialized) {
        if (!item.variantId) {
          throw new AppBadRequestException(
            await this.i18n.translate('errors.variant_required', { args: { name: product.name } }),
            'VARIANT_REQUIRED',
          )
        }
        const variant = variantsById.get(item.variantId)
        if (!variant || variant.productId !== product.id || !variant.isActive) {
          throw new AppBadRequestException(
            await this.i18n.translate('errors.variant_not_found'),
            'VARIANT_NOT_FOUND',
          )
        }
      }

      // Only VARIABLE_QUANTITY products may be sold in fractional amounts.
      if (
        product.productType !== ProductType.VARIABLE_QUANTITY &&
        !Number.isInteger(item.quantity)
      ) {
        throw new AppBadRequestException(
          await this.i18n.translate('errors.quantity_must_be_integer', {
            args: { name: product.name },
          }),
          'QUANTITY_MUST_BE_INTEGER',
        )
      }
    }

    // Load + validate serial units (Phase 3G).
    const serialUnitIds = [
      ...new Set(
        dto.items.map((item) => item.serialUnitId).filter((id): id is string => Boolean(id)),
      ),
    ]
    const serialUnits = serialUnitIds.length
      ? await manager.getRepository(ProductSerialUnit).find({
          where: { id: In(serialUnitIds), businessId, deletedAt: IsNull() },
        })
      : []
    const serialUnitsById = new Map(serialUnits.map((unit) => [unit.id, unit]))

    for (const item of dto.items) {
      const product = productsById.get(item.productId)!
      if (!product.isSerialized) continue
      if (!item.serialUnitId) {
        throw new AppBadRequestException(
          await this.i18n.translate('errors.serial_unit_required', {
            args: { name: product.name },
          }),
          'SERIAL_UNIT_REQUIRED',
        )
      }
      const unit = serialUnitsById.get(item.serialUnitId)
      const available =
        unit?.status === SerialUnitStatus.IN_STOCK || unit?.status === SerialUnitStatus.RESERVED
      if (
        !unit ||
        unit.productId !== product.id ||
        (!available && !options?.allowUnavailableSerials)
      ) {
        throw new AppBadRequestException(
          await this.i18n.translate('errors.serial_unit_unavailable'),
          'SERIAL_UNIT_UNAVAILABLE',
        )
      }
      if (product.hasVariants && item.variantId && unit.variantId !== item.variantId) {
        throw new AppBadRequestException(
          await this.i18n.translate('errors.serial_unit_variant_mismatch'),
          'SERIAL_UNIT_VARIANT_MISMATCH',
        )
      }
    }

    return { products, variantsById, serialUnitsById }
  }

  /**
   * Expand sale lines into inventory deduction lines: COMPOSITE products are
   * replaced by their component products (quantity × per-bundle quantity), so a
   * bundle sale debits every component atomically. Other products pass through.
   */
  private async expandSaleItemsForInventory(
    manager: EntityManager,
    businessId: string,
    lines: Array<{
      productId: string
      variantId?: string | null
      productName: string
      quantity: number
      movementId?: string | null
    }>,
  ): Promise<
    Array<{
      productId: string
      variantId?: string | null
      productName: string
      quantity: number
      movementId?: string | null
    }>
  > {
    const productIds = [...new Set(lines.map((line) => line.productId))]
    const products = await manager.getRepository(Product).find({
      where: { id: In(productIds), businessId },
    })
    const compositeIds = products
      .filter((product) => product.productType === ProductType.COMPOSITE)
      .map((product) => product.id)

    const componentsByBundle = new Map<string, ProductBundleComponent[]>()
    if (compositeIds.length > 0) {
      const components = await manager.getRepository(ProductBundleComponent).find({
        where: { bundleProductId: In(compositeIds), businessId, deletedAt: IsNull() },
      })
      for (const component of components) {
        const list = componentsByBundle.get(component.bundleProductId) ?? []
        list.push(component)
        componentsByBundle.set(component.bundleProductId, list)
      }
    }
    // The components themselves, to know which of them hold a stock level.
    const componentIds = [
      ...new Set([...componentsByBundle.values()].flat().map((c) => c.componentProductId)),
    ].filter((id) => !productIds.includes(id))
    const componentProducts = componentIds.length
      ? await manager.getRepository(Product).find({ where: { id: In(componentIds), businessId } })
      : []
    const productById = new Map([...products, ...componentProducts].map((p) => [p.id, p]))

    // Which levels the lines change (@biztrack/domain saleStockLines, as the till): a bundle
    // takes from its components, a serialized product's units carry its stock.
    return saleStockLines(lines, {
      product: (id) => productById.get(id),
      components: (id) => componentsByBundle.get(id) ?? [],
    })
  }

  /** Mark a sale's serialised units SOLD (Phase 3G). Runs in the sale transaction. */
  private async markSerialUnitsSold(
    manager: EntityManager,
    businessId: string,
    saleId: string,
    customerId: string | null,
    items: Array<{ id: string; serialUnitId?: string | null }>,
    /** `tolerateUnavailable`: do not reject when a unit is already taken; return its id. */
    options?: { tolerateUnavailable?: boolean },
  ): Promise<string[]> {
    const repo = manager.getRepository(ProductSerialUnit)
    const unavailable: string[] = []
    for (const item of items) {
      if (!item.serialUnitId) continue
      const result = await repo.update(
        {
          id: item.serialUnitId,
          businessId,
          status: In([SerialUnitStatus.IN_STOCK, SerialUnitStatus.RESERVED]),
        },
        {
          status: SerialUnitStatus.SOLD,
          saleId,
          saleItemId: item.id,
          soldAt: new Date(),
          customerId,
          reservedAt: null,
          reservedBy: null,
        },
      )
      if (!result.affected) {
        if (!options?.tolerateUnavailable) {
          throw new AppBadRequestException(
            await this.i18n.translate('errors.serial_unit_unavailable'),
            'SERIAL_UNIT_UNAVAILABLE',
          )
        }
        unavailable.push(item.serialUnitId)
      }
    }
    return unavailable
  }

  /** Return a voided sale's serialised units to IN_STOCK (Phase 3G). */
  private async releaseSerialUnitsForVoid(
    manager: EntityManager,
    businessId: string,
    items: Array<{ serialUnitId?: string | null }>,
  ): Promise<void> {
    const repo = manager.getRepository(ProductSerialUnit)
    for (const item of items) {
      if (!item.serialUnitId) continue
      await repo.update(
        { id: item.serialUnitId, businessId, status: SerialUnitStatus.SOLD },
        {
          status: SerialUnitStatus.IN_STOCK,
          saleId: null,
          saleItemId: null,
          soldAt: null,
          customerId: null,
        },
      )
    }
  }

  // A serialised line carries serialUnitIds[]; expand it into one item per unit (quantity
  // 1) so load/validate/mark all operate one-unit-at-a-time. The line discount lands on
  // the first unit so the line total is preserved. Non-serialised items pass through.
  private expandSerialItems(items: CreateSaleItemDto[]): CreateSaleItemDto[] {
    const out: CreateSaleItemDto[] = []
    for (const item of items) {
      const serialIds = item.serialUnitIds?.length
        ? [...new Set(item.serialUnitIds)]
        : item.serialUnitId
          ? [item.serialUnitId]
          : null
      if (!serialIds) {
        out.push(item)
        continue
      }
      serialIds.forEach((serialUnitId, idx) => {
        out.push({
          ...item,
          serialUnitId,
          serialUnitIds: undefined,
          quantity: 1,
          discountAmount: idx === 0 ? (item.discountAmount ?? 0) : 0,
        })
      })
    }
    return out
  }

  private computeSale(
    products: Product[],
    variantsById: Map<string, ProductVariant>,
    serialUnitsById: Map<string, ProductSerialUnit>,
    dto: SaleComputationInput,
  ) {
    const productsById = new Map(products.map((product) => [product.id, product]))
    // Pricing is @biztrack/domain's priceSale — the same function every runtime runs — so the
    // totals stored here are the ones the till computed. This method only attaches the
    // catalogue context (product, variant, serial unit, cost) to each priced line.
    const pricing = priceSale({
      lines: dto.items.map((input) => ({
        quantity: roundQuantity(input.quantity),
        unitPrice: input.unitPrice,
        unitPriceListed: input.unitPriceListed,
        discountAmount: input.discountAmount,
        reasonCode: input.reasonCode,
        reasonNote: input.reasonNote,
      })),
      cartDiscount: dto.discountAmount,
      charges: dto.chargesAmount,
    })
    const items: ComputedSaleItem[] = []
    let priceDriftWarning = false

    dto.items.forEach((input, index) => {
      const product = productsById.get(input.productId)

      if (!product) {
        throw new AppBadRequestException(
          'Product not found in sale payload.',
          'PRODUCT_NOT_FOUND',
          { productId: input.productId },
        )
      }

      const priced = pricing.lines[index]!
      const variant = input.variantId ? variantsById.get(input.variantId) : undefined
      // A variant costs its own cost when it has one (@biztrack/domain), as on the till.
      const costPrice =
        input.costPrice !== undefined ? toWholeXaf(input.costPrice) : variantCost(product, variant)

      // Drift reflects what the cashier actually charged, not the rung listed price.
      if (hasPriceDrift(priced.chargedUnitPrice, product.sellingPrice)) {
        priceDriftWarning = true
      }

      const serialUnit = input.serialUnitId ? serialUnitsById.get(input.serialUnitId) : undefined
      items.push({
        product,
        // Serialised lines have no explicit variantId — derive it from the serial unit so the
        // sale item still records the correct variant.
        variantId: variant?.id ?? serialUnit?.variantId ?? null,
        variantName: variant?.name ?? input.variantName ?? null,
        serialUnitId: serialUnit?.id ?? input.serialUnitId ?? null,
        serialNumber: serialUnit?.serialNumber ?? input.serialNumber ?? null,
        quantity: priced.quantity,
        unitPrice: priced.unitPrice,
        unitPriceListed: priced.unitPriceListed,
        cartDiscountAlloc: priced.cartDiscountAlloc,
        discountAmount: priced.discountAmount,
        lineTotal: priced.lineTotal,
        costPrice,
        lineDiscounts: priced.lineDiscounts.map((discount) => ({
          ...discount,
          description: discount.discountType === 'OVERRIDE' ? 'Negotiated price' : 'Line discount',
        })),
      })
    })

    return {
      items,
      subtotal: pricing.subtotal,
      saleDiscountAmount: pricing.discountAmount,
      saleChargesAmount: pricing.chargesAmount,
      totalAmount: pricing.totalAmount,
      priceDriftWarning,
    }
  }

  private async findSaleDetailBy(
    predicate: string,
    params: Record<string, unknown>,
    manager?: EntityManager,
  ) {
    const repo = manager?.getRepository(Sale) ?? this.salesRepo

    return repo
      .createQueryBuilder('sale')
      .leftJoinAndSelect('sale.cashier', 'cashier')
      .leftJoinAndSelect('sale.business', 'business')
      .leftJoinAndSelect('sale.items', 'items')
      .leftJoinAndSelect('sale.payments', 'payments')
      .where('sale.business_id = :businessId', { businessId: params.businessId })
      .andWhere(predicate, params)
      .orderBy('items.created_at', 'ASC')
      .addOrderBy('payments.created_at', 'ASC')
      .getOne()
  }

  private async applyVoidFromSync(
    manager: EntityManager,
    businessId: string,
    saleId: string,
    payload: SaleSyncPayload,
  ) {
    const sale = await this.findSaleDetailBy('sale.id = :id', { id: saleId, businessId }, manager)

    if (!sale || sale.status === SaleStatus.VOIDED) {
      return
    }
    // Same rule as an online void: only the balance left after refunds is voided, and a
    // fully refunded sale has nothing left to void, so it stays as it is.
    const voidDecision = await this.decideVoid(manager, sale)
    if (!voidDecision.ok) return
    const voidLines = this.voidedItems(sale.items ?? [], voidDecision.lines)

    const voidedAt = this.parseOptionalDate(payload.voidedAt) ?? new Date()
    const voidedById = this.isUuid(payload.voidedById) ? payload.voidedById : null
    const voidReason = this.normalizeOptionalString(payload.voidReason) ?? 'Voided from sync'
    const saleRepo = manager.getRepository(Sale)

    await saleRepo.update(sale.id, {
      status: SaleStatus.VOIDED,
      syncedAt: new Date(),
      voidedAt,
      voidedById,
      voidReason,
    })

    await this.inventoryService.reverseForVoidedSale(
      businessId,
      sale.id,
      sale.saleNumber,
      voidedById ?? sale.cashierId,
      await this.expandSaleItemsForInventory(
        manager,
        businessId,
        voidLines.map(({ item, quantity }) => ({
          productId: item.productId,
          variantId: item.variantId ?? null,
          productName: item.productName,
          quantity,
        })),
      ),
      manager,
    )

    await this.releaseSerialUnitsForVoid(
      manager,
      businessId,
      voidLines.map(({ item }) => item),
    )

    await this.dailySummaryService.decrementForVoid(
      sale,
      sale.items ?? [],
      sale.payments ?? [],
      manager,
      voidDecision.balance,
    )

    await this.debtsService.writeOffSourceDebt(manager, {
      businessId,
      sourceType: DebtSource.SALE,
      sourceId: sale.id,
      reason: `Sale ${sale.saleNumber} was voided from sync.`,
      writtenOffAt: voidedAt,
      writtenOffById: voidedById,
    })

    // NOTE: deposit (savings) refunds are intentionally NOT applied here. The desktop is
    // the source of truth for savings — it refunds locally on void and pushes the
    // savings account + transaction as their own sync entities (mirroring how create's
    // savings draw-down is client-authoritative and createFromSync leaves it alone).
    // Refunding here as well would double-credit the deposit. The direct void() endpoint
    // (cloud, no local savings state) is the one that refunds savings itself.
  }

  /**
   * Apply a refund/return the device recorded offline (BIZ-1.8) — the sync counterpart of the
   * direct `refund()` endpoint. Idempotent by return id (a return that already exists — e.g.
   * pulled back down — is skipped). Mirrors applyVoidFromSync: the server does its own authoritative
   * restock/settlement/debt; savings are client-authoritative and left alone.
   */
  private async applyRefundFromSync(
    manager: EntityManager,
    businessId: string,
    saleId: string,
    payload: SaleSyncPayload,
    /** Collects the review flags this refund raises (ruling R1); the caller stores them. */
    flagDrafts: ReviewFlagDraft[],
  ) {
    const returns = payload.returns ?? []
    if (returns.length === 0) return
    const sale = await this.findSaleDetailBy('sale.id = :id', { id: saleId, businessId }, manager)
    if (!sale || sale.status === SaleStatus.VOIDED) return

    const returnRepo = manager.getRepository(SaleReturn)
    const returnItemRepo = manager.getRepository(SaleReturnItem)
    const paymentRepo = manager.getRepository(SalePayment)
    const saleItems = sale.items ?? []
    const now = new Date()

    for (const ret of returns) {
      // Idempotent: this return already landed (a prior sync, or it pulled back down).
      if (await returnRepo.findOne({ where: { id: ret.id } })) continue

      // Ruling R1: the refund already happened at the till. Which lines the server can
      // apply is decided by the same rule as an online refund (what is left of each line);
      // the money is recorded as the till handed it back, and any disagreement is flagged.
      const requestedLines = ret.items ?? []
      const knownLines = requestedLines.filter((r) =>
        saleItems.some((si) => si.id === r.saleItemId),
      )
      const returnedBefore = await this.returnedQuantityByItem(manager, sale.id)
      const owed = await this.debtsService.sourceDebtBalance(manager, {
        businessId,
        sourceType: DebtSource.SALE,
        sourceId: sale.id,
      })
      // Everything received for the sale: at the till and on its debt.
      const paidBefore =
        (await this.recomputeSaleSettlement(manager, sale.id, sale.totalAmount)).amountPaid +
        owed.paid
      const tillRefundAmount = toWholeXaf(ret.refundAmount ?? 0)
      const decision =
        knownLines.length > 0
          ? decideSaleRefund({
              items: saleItems.map((item) => ({
                id: item.id,
                quantity: item.quantity,
                lineTotal: item.lineTotal,
                returnedQuantity: returnedBefore.get(item.id) ?? 0,
              })),
              returns: knownLines,
              requestedAmount: tillRefundAmount,
              amountPaid: paidBefore,
              outstandingBalance: owed.outstanding,
            })
          : null
      const returnedLines =
        decision && decision.ok
          ? decision.lines.map((line) => {
              const item = saleItems.find((si) => si.id === line.saleItemId)!
              const requested = knownLines[line.requestIndex ?? -1]
              return {
                id: requested?.id ?? randomUUID(),
                item,
                quantity: line.quantity,
                serialUnitId: requested?.serialUnitId ?? item.serialUnitId ?? null,
              }
            })
          : []
      // Nothing came back and no money moved: there is nothing to record.
      if (returnedLines.length === 0 && tillRefundAmount <= 0) continue

      flagDrafts.push(
        ...reviewSyncedRefund({
          saleId: sale.id,
          returnId: ret.id,
          tillRefundAmount,
          amountPaid: paidBefore,
          goodsValue: decision && decision.ok ? decision.goodsValue : 0,
          tillQuantity: requestedLines.reduce((sum, r) => sum + roundQuantity(r.quantity), 0),
          appliedQuantity: returnedLines.reduce((sum, r) => sum + r.quantity, 0),
          unknownLineCount: requestedLines.length - knownLines.length,
        }),
      )

      // The money the till handed back is a fact; the goods it did not pay back for come
      // off what the customer still owes (ruling R10).
      if (decision && decision.ok) {
        await this.debtsService.reduceSourceDebt(manager, {
          businessId,
          sourceType: DebtSource.SALE,
          sourceId: sale.id,
          amount: returnDebtReduction({
            goodsValue: decision.goodsValue,
            cashRefunded: tillRefundAmount,
            outstandingBalance: owed.outstanding,
          }),
        })
      }

      // The refund is booked on the day it happened at the till, not the day it synced.
      const returnedAt = this.parseOptionalDate(ret.createdAt) ?? now
      const returnBusinessDate = await this.calendar.resolveForSync(
        businessId,
        returnedAt,
        ret.businessDate ?? null,
        null,
      )
      await returnRepo.save(
        returnRepo.create({
          id: ret.id,
          saleId: sale.id,
          businessId,
          onlineOrderId: sale.onlineOrderId ?? null,
          reason: this.normalizeOptionalString(ret.reason) ?? null,
          restock: ret.restock !== false,
          refundAmount: tillRefundAmount,
          createdById: sale.cashierId,
          businessDate: returnBusinessDate,
          createdAt: returnedAt,
        }),
      )
      if (returnedLines.length > 0) {
        await returnItemRepo.save(
          returnedLines.map((r) =>
            returnItemRepo.create({
              id: r.id,
              saleReturnId: ret.id,
              businessId,
              saleItemId: r.item.id,
              quantity: r.quantity,
              serialUnitId: r.serialUnitId ?? null,
            }),
          ),
        )
      }

      if (ret.refundPayment && ret.refundPayment.amount > 0) {
        if (!(await paymentRepo.findOne({ where: { id: ret.refundPayment.id } }))) {
          await paymentRepo.save(
            paymentRepo.create({
              id: ret.refundPayment.id,
              saleId: sale.id,
              businessId,
              method: (ret.refundPayment.method as PaymentMethod) ?? PaymentMethod.CASH,
              amount: toWholeXaf(ret.refundPayment.amount),
              kind: SalePaymentKind.REFUND,
              recordedAt: returnedAt,
              recordedById: sale.cashierId,
              note: this.normalizeOptionalString(ret.reason) ?? 'Refund',
            }),
          )
        }
      }

      // The refund comes off the revenue of the day it happened at the till (ruling R4).
      await this.dailySummaryService.applyRefund(
        businessId,
        returnedAt.toISOString().slice(0, 10),
        refundProfitImpact({
          restock: ret.restock !== false,
          lines: returnedLines.map((r) => ({
            returnedQuantity: r.quantity,
            soldQuantity: r.item.quantity,
            lineTotal: r.item.lineTotal,
            costPrice: r.item.costPrice ?? null,
          })),
        }),
        manager,
      )

      if (ret.restock !== false && returnedLines.length > 0) {
        await this.inventoryService.reverseForVoidedSale(
          businessId,
          sale.id,
          sale.saleNumber,
          sale.cashierId,
          await this.expandSaleItemsForInventory(
            manager,
            businessId,
            returnedLines.map((r) => ({
              productId: r.item.productId,
              variantId: r.item.variantId ?? null,
              productName: r.item.productName,
              quantity: r.quantity,
            })),
          ),
          manager,
        )
        await this.releaseSerialUnitsForVoid(
          manager,
          businessId,
          returnedLines
            .filter((r) => r.serialUnitId)
            .map((r) => ({ serialUnitId: r.serialUnitId })),
        )
      }
    }

    // Recompute settlement from the signed payment ledger. The status is decided here from
    // the quantities returned across ALL of the sale's returns (ruling R5), not taken from
    // the device: a second partial return that brings back the rest completes the sale.
    const settlement = await this.recomputeSaleSettlement(manager, sale.id, sale.totalAmount)
    const returnedByItem = await this.returnedQuantityByItem(manager, sale.id)
    if (returnedByItem.size === 0) return
    const status = saleReturnStatus(
      saleItems.map((item) => ({
        quantity: item.quantity,
        returnedQuantity: returnedByItem.get(item.id) ?? 0,
      })),
    )
    await manager.getRepository(Sale).update(sale.id, {
      amountPaid: settlement.amountPaid,
      creditAmount: settlement.creditAmount,
      status,
      syncedAt: new Date(),
    })

    // A full return cancels the receivable — the goods came back.
    if (status === SaleStatus.REFUNDED) {
      await this.debtsService.writeOffSourceDebt(manager, {
        businessId,
        sourceType: DebtSource.SALE,
        sourceId: sale.id,
        reason: `Sale ${sale.saleNumber} returned (synced).`,
        writtenOffAt: now,
        writtenOffById: sale.cashierId,
      })
    }
  }

  private resolveSortField(sortBy?: string) {
    // Entity PROPERTY paths (not raw columns): findAll uses loadRelationCountAndMap on the
    // items collection + skip/take, so TypeORM paginates via a distinct subquery and
    // resolves orderBy against entity metadata — raw columns (sale.sold_at) break it.
    const sortMap: Record<string, string> = {
      saleDate: 'sale.saleDate',
      soldAt: 'sale.soldAt',
      createdAt: 'sale.createdAt',
      totalAmount: 'sale.totalAmount',
      saleNumber: 'sale.saleNumber',
      customerName: 'sale.customerName',
      status: 'sale.status',
    }

    return sortMap[sortBy ?? ''] ?? 'sale.soldAt'
  }

  private normalizeDate(value: string) {
    const date = new Date(value)

    if (Number.isNaN(date.getTime())) {
      throw new AppBadRequestException('Invalid sale date.', 'INVALID_SALE_DATE')
    }

    return date
  }

  private parseOptionalDate(value?: string | null) {
    if (!value) {
      return null
    }

    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  private normalizeOptionalString(value?: string | null) {
    const trimmed = value?.trim()
    return trimmed ? trimmed : null
  }

  private async isOnlineOrder(
    manager: EntityManager,
    businessId: string,
    orderId: string,
  ): Promise<boolean> {
    const [row] = (await manager.query(
      `SELECT 1 FROM online_orders WHERE id = $1 AND business_id = $2 LIMIT 1`,
      [orderId, businessId],
    )) as unknown[]
    return !!row
  }

  private async resolveSaleCreditContext(
    manager: EntityManager,
    businessId: string,
    rawCustomerId: string | null | undefined,
    totalAmount: number,
    amountPaid: number,
    expectedCreditAmount?: number | null,
    collectedOnDelivery = false,
  ) {
    const customerId = this.normalizeOptionalUuid(rawCustomerId)
    const { creditAmount } = settleSale({ totalAmount, payments: [{ amount: amountPaid }] })
    const rejection = checkSaleCredit({
      creditAmount,
      hasCustomer: !!customerId,
      expectedCreditAmount,
      collectedOnDelivery,
    })

    if (rejection === 'SALE_CREDIT_AMOUNT_MISMATCH') {
      throw new AppBadRequestException(
        'Sale credit amount does not match the unpaid balance.',
        'SALE_CREDIT_AMOUNT_MISMATCH',
        {
          expectedCreditAmount,
          computedCreditAmount: creditAmount,
        },
      )
    }

    if (rejection === 'CUSTOMER_REQUIRED_FOR_CREDIT') {
      throw new AppBadRequestException(
        await this.i18n.translate('errors.customer_contact_required_for_credit' as never),
        'CUSTOMER_CONTACT_REQUIRED_FOR_CREDIT',
        { totalAmount, amountPaid, creditAmount },
      )
    }

    if (customerId) {
      await this.debtsService.requireCreditContact(
        customerId,
        businessId,
        DebtDirection.RECEIVABLE,
        manager,
      )
    }

    return {
      customerId,
      creditAmount,
    }
  }

  private normalizeSyncSaleStatus(value?: SaleStatus | null): SaleStatus {
    if (value === SaleStatus.VOIDED) return SaleStatus.VOIDED
    if (value === SaleStatus.REFUNDED) return SaleStatus.REFUNDED
    if (value === SaleStatus.PARTIALLY_REFUNDED) return SaleStatus.PARTIALLY_REFUNDED
    return SaleStatus.COMPLETED
  }

  /** A priced sale in the shape the discount rules take. */
  private saleDiscountInput(computed: ReturnType<SalesService['computeSale']>) {
    return {
      lines: computed.items.map((it) => ({
        discountAmount: it.discountAmount,
        listedLineValue: toWholeXaf((it.unitPriceListed ?? it.unitPrice) * it.quantity),
      })),
      cartDiscount: computed.saleDiscountAmount,
      subtotal: computed.subtotal,
    }
  }

  /** Whether any line of a priced sale went below its cost; the charged unit price nets
   * the line discount. */
  private saleIsBelowCost(computed: ReturnType<SalesService['computeSale']>): boolean {
    return isBelowCost(
      computed.items.map((it) => ({
        chargedUnitPrice:
          it.quantity > 0 ? (it.unitPrice * it.quantity - it.discountAmount) / it.quantity : 0,
        cost: it.costPrice,
      })),
    )
  }

  private resolveSyncCashierId(payload: SaleSyncPayload) {
    if (this.isUuid(payload.cashierId)) {
      return payload.cashierId
    }

    if (this.isUuid(payload.fallbackCashierId)) {
      return payload.fallbackCashierId
    }

    throw new AppBadRequestException('Sale cashier is required.', 'SALE_CASHIER_REQUIRED')
  }

  private firstMobileMoneyReference(
    payments: Array<{ mobileMoneyReference?: string | null }>,
  ): string | null {
    return (
      payments
        .find((payment) => payment.mobileMoneyReference?.trim())
        ?.mobileMoneyReference?.trim() ?? null
    )
  }

  private isUniqueConstraintViolation(error: unknown, constraint: string) {
    return Boolean(
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === '23505' &&
      'constraint' in error &&
      (error as { constraint?: string }).constraint === constraint,
    )
  }

  private isUuid(value: string | null | undefined): value is string {
    return Boolean(
      value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
    )
  }

  private normalizeOptionalUuid(value: string | null | undefined) {
    const trimmed = value?.trim()
    if (!trimmed) {
      return null
    }

    if (!this.isUuid(trimmed)) {
      throw new AppBadRequestException('Sale customer id is invalid.', 'INVALID_SALE_CUSTOMER_ID')
    }

    return trimmed
  }

  private async handleServiceError(
    action: string,
    error: unknown,
    metadata?: LogMetadata,
  ): Promise<never> {
    if (error instanceof AppException) {
      this.logger.warn('SalesService error', 'SalesService', {
        action,
        code: error.code,
        status: error.getStatus(),
        ...(metadata ?? {}),
      })
      throw error
    }

    this.logger.error('SalesService unexpected error', 'SalesService', {
      action,
      message: error instanceof Error ? error.message : 'Unknown error',
      ...(metadata ?? {}),
    })

    throw new AppInternalServerException(
      await this.i18n.translate('errors.server_error'),
      'SALES_SERVICE_ERROR',
      { action },
    )
  }
}
