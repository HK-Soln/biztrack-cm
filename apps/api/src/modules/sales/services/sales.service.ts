import { randomUUID } from 'crypto'
import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { Logger, LogMetadata } from '@biztrack/logger'
import {
  BusinessMemberRole,
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
  type SalesQuery,
} from '@biztrack/types'
import { I18nService } from 'nestjs-i18n'
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm'
import { AppException } from '@/common/exceptions/app.exception'
import {
  AppBadRequestException,
  AppForbiddenException,
  AppInternalServerException,
  AppNotFoundException,
} from '@/common/exceptions/app-exceptions'
import { Business } from '@/entities/business.entity'
import { AuditService } from '@/modules/audit/audit.service'
import type { AuditContext } from '@biztrack/types'
import { Product } from '@/entities/product.entity'
import { ProductVariant } from '@/entities/product-variant.entity'
import { ProductBundleComponent } from '@/entities/product-bundle-component.entity'
import { ProductSerialUnit } from '@/entities/product-serial-unit.entity'
import { Sale } from '@/entities/sale.entity'
import { SaleCharge } from '@/entities/sale-charge.entity'
import { SaleDiscount } from '@/entities/sale-discount.entity'
import { SaleItem } from '@/entities/sale-item.entity'
import { SalePayment } from '@/entities/sale-payment.entity'
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

/** Input for {@link SalesService.refund} — a full or partial return/refund of a sale. */
export interface RefundSaleInput {
  /** Money to return; defaults to the goods value of returned lines, capped at amountPaid. */
  amount?: number
  /** Returned lines; omit for a full return of every line. */
  items?: Array<{ saleItemId: string; quantity: number; serialUnitId?: string | null }>
  /** Restore inventory + release serial units (default true). */
  restock?: boolean
  reason?: string
}

type ComputedSaleItem = {
  product: Product
  variantId: string | null
  variantName: string | null
  serialUnitId: string | null
  serialNumber: string | null
  quantity: number
  unitPrice: number
  discountAmount: number
  lineTotal: number
  costPrice: number | null
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
    discountAmount?: number
    costPrice?: number
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
    private readonly i18n: I18nService<I18nTranslations>,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    this.logger.setContext('SalesService')
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
            ? this.roundMoney(dto.charges.reduce((sum, c) => sum + (c.amount || 0), 0))
            : dto.chargesAmount,
          discountAmount: dto.discounts?.length
            ? this.roundMoney(dto.discounts.reduce((sum, d) => sum + (d.amount || 0), 0))
            : dto.discountAmount,
        }
        const { products, variantsById, serialUnitsById } = await this.loadProductsForSale(
          manager,
          businessId,
          computeDto,
        )
        const computed = this.computeSale(products, variantsById, serialUnitsById, computeDto)
        const amountPaid = this.roundMoney(
          dto.payments.reduce((sum, payment) => sum + payment.amount, 0),
        )
        const { customerId, creditAmount } = await this.resolveSaleCreditContext(
          manager,
          businessId,
          dto.customerId,
          computed.totalAmount,
          amountPaid,
        )
        const paymentMethod = this.deriveStoredPaymentMethod(dto.payments)
        const momoReference = this.firstMobileMoneyReference(dto.payments)

        const changeGiven = this.roundMoney(amountPaid - computed.totalAmount)
        const saleNumber = await this.saleNumberService.generate(businessId, saleDate, manager)
        const now = new Date()

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
            soldAt,
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
              discountAmount: item.discountAmount,
              lineTotal: item.lineTotal,
              totalPrice: item.lineTotal,
              costPrice: item.costPrice,
            }),
          ),
        )

        const paymentRepo = manager.getRepository(SalePayment)
        const salePayments = await paymentRepo.save(
          dto.payments.map((payment) =>
            paymentRepo.create({
              saleId: sale.id,
              businessId,
              method: payment.method,
              amount: this.roundMoney(payment.amount),
              mobileMoneyReference: payment.mobileMoneyReference?.trim() || null,
              savingsAccountId: payment.savingsAccountId ?? null,
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
                amount: this.roundMoney(c.amount),
              }),
            ),
          )
        }
        if (dto.discounts?.length) {
          const discountRepo = manager.getRepository(SaleDiscount)
          await discountRepo.save(
            dto.discounts.map((d) =>
              discountRepo.create({
                saleId: sale.id,
                businessId,
                description: d.description,
                discountType: d.discountType,
                rate: d.rate ?? null,
                amount: this.roundMoney(d.amount),
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
                amount: this.roundMoney(payment.amount),
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

      await this.dataSource.transaction(async (manager) => {
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
          }

          return
        }

        const soldAt = this.normalizeDate(payload.soldAt)
        const saleDate = soldAt.toISOString().slice(0, 10)
        const { products, variantsById, serialUnitsById } = await this.loadProductsForSale(
          manager,
          businessId,
          payload,
        )
        const computed = this.computeSale(products, variantsById, serialUnitsById, payload)
        const amountPaid = this.roundMoney(
          payload.payments.reduce((sum, payment) => sum + payment.amount, 0),
        )
        const { customerId, creditAmount } = await this.resolveSaleCreditContext(
          manager,
          businessId,
          payload.customerId,
          computed.totalAmount,
          amountPaid,
          payload.creditAmount,
        )
        const paymentMethod = this.deriveStoredPaymentMethod(payload.payments)
        const momoReference = this.firstMobileMoneyReference(payload.payments)

        const cashierId = this.resolveSyncCashierId(payload)
        const changeGiven = this.roundMoney(amountPaid - computed.totalAmount)
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
            soldAt,
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
              amount: this.roundMoney(payment.amount),
              mobileMoneyReference: payment.mobileMoneyReference?.trim() || null,
              savingsAccountId: payment.savingsAccountId ?? null,
            }),
          ),
        )

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
                  amount: this.roundMoney(c.amount),
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
                  businessId,
                  description: d.description,
                  discountType: d.discountType,
                  rate: d.rate ?? null,
                  amount: this.roundMoney(d.amount),
                }),
              )
            }
          }
        }

        await this.inventoryService.deductForSale(
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
        )

        // Online orders post the sale at confirm but keep serials RESERVED until handover
        // (deferSerialSold); they flip to SOLD when the order is delivered/picked up.
        if (!payload.deferSerialSold) {
          await this.markSerialUnitsSold(
            manager,
            businessId,
            sale.id,
            customerId ?? null,
            saleItems,
          )
        }

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
            notes: payload.notes?.trim() || null,
            createdAt: soldAt,
          })
        }

        if (targetStatus === SaleStatus.VOIDED) {
          await this.applyVoidFromSync(manager, businessId, sale.id, payload)
        }
        saleId = sale.id
      })

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

      if (query.dateFrom) {
        qb.andWhere('sale.sale_date >= :dateFrom', { dateFrom: query.dateFrom })
      }

      if (query.dateTo) {
        qb.andWhere('sale.sale_date <= :dateTo', { dateTo: query.dateTo })
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
      const params: unknown[] = [businessId]
      const conds = ['s.business_id = $1', 's.deleted_at IS NULL']
      if (query.customerId) {
        params.push(query.customerId)
        conds.push(`s.customer_id = $${params.length}`)
      }
      if (query.dateFrom) {
        params.push(query.dateFrom)
        conds.push(`s.sale_date >= $${params.length}`)
      }
      if (query.dateTo) {
        params.push(query.dateTo)
        conds.push(`s.sale_date <= $${params.length}`)
      }
      const where = conds.join(' AND ')
      const mgr = this.salesRepo.manager
      const [tot] = (await mgr.query(
        `SELECT COALESCE(SUM(s.total_amount), 0) AS revenue, COUNT(*)::int AS txns
         FROM sales s WHERE ${where} AND s.status = 'COMPLETED'`,
        params,
      )) as Array<{ revenue: string; txns: number }>
      const [units] = (await mgr.query(
        `SELECT COALESCE(SUM(si.quantity), 0) AS units
         FROM sale_items si JOIN sales s ON s.id = si.sale_id
         WHERE ${where} AND s.status = 'COMPLETED' AND si.deleted_at IS NULL`,
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

      const revenue = this.roundMoney(Number(tot?.revenue ?? 0))
      const transactions = Number(tot?.txns ?? 0)
      return {
        revenue,
        transactions,
        averageBasket: transactions > 0 ? this.roundMoney(revenue / transactions) : 0,
        itemsSold: Number(units?.units ?? 0),
        refundCount: Number(ref?.n ?? 0),
        refundAmount: this.roundMoney(Number(ref?.amt ?? 0)),
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
      const params: unknown[] = [businessId]
      const conds = ['s.business_id = $1', 's.deleted_at IS NULL']
      if (query.dateFrom) {
        params.push(query.dateFrom)
        conds.push(`s.sale_date >= $${params.length}`)
      }
      if (query.dateTo) {
        params.push(query.dateTo)
        conds.push(`s.sale_date <= $${params.length}`)
      }
      const where = conds.join(' AND ')
      const rows = (await this.salesRepo.manager.query(
        `SELECT d.sale_date AS date, d.txns, d.total, d.credit,
                COALESCE(p.cash, 0) AS cash, COALESCE(p.momo, 0) AS momo, COALESCE(p.card, 0) AS card
         FROM (
           SELECT s.sale_date, COUNT(*)::int AS txns,
                  COALESCE(SUM(s.total_amount), 0) AS total,
                  COALESCE(SUM(s.credit_amount), 0) AS credit
           FROM sales s WHERE ${where} AND s.status = 'COMPLETED'
           GROUP BY s.sale_date
         ) d
         LEFT JOIN (
           SELECT s.sale_date,
                  SUM(CASE WHEN sp.method = 'CASH' THEN sp.amount ELSE 0 END) AS cash,
                  SUM(CASE WHEN sp.method IN ('MTN_MOMO','ORANGE_MONEY') THEN sp.amount ELSE 0 END) AS momo,
                  SUM(CASE WHEN sp.method = 'CARD' THEN sp.amount ELSE 0 END) AS card
           FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id
           WHERE ${where} AND s.status = 'COMPLETED'
           GROUP BY s.sale_date
         ) p ON p.sale_date = d.sale_date
         ORDER BY d.sale_date ASC`,
        params,
      )) as Array<{
        date: string | Date
        txns: number
        total: string
        credit: string
        cash: string
        momo: string
        card: string
      }>
      return rows.map((r) => ({
        date:
          typeof r.date === 'string'
            ? r.date.slice(0, 10)
            : new Date(r.date).toISOString().slice(0, 10),
        transactions: Number(r.txns ?? 0),
        total: this.roundMoney(Number(r.total ?? 0)),
        cash: this.roundMoney(Number(r.cash ?? 0)),
        momo: this.roundMoney(Number(r.momo ?? 0)),
        card: this.roundMoney(Number(r.card ?? 0)),
        credit: this.roundMoney(Number(r.credit ?? 0)),
      }))
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
      const params: unknown[] = [businessId]
      const conds = ['s.business_id = $1', 's.deleted_at IS NULL']
      if (query.dateFrom) {
        params.push(query.dateFrom)
        conds.push(`s.sale_date >= $${params.length}`)
      }
      if (query.dateTo) {
        params.push(query.dateTo)
        conds.push(`s.sale_date <= $${params.length}`)
      }
      const where = conds.join(' AND ')
      const rows = (await this.salesRepo.manager.query(
        `SELECT s.cashier_id AS "cashierId", COALESCE(u.name, '') AS name,
                COUNT(DISTINCT CASE WHEN s.status = 'COMPLETED' THEN s.sale_date END)::int AS shifts,
                COUNT(CASE WHEN s.status = 'COMPLETED' THEN 1 END)::int AS transactions,
                COALESCE(SUM(CASE WHEN s.status = 'COMPLETED' THEN s.total_amount ELSE 0 END), 0) AS sales,
                COALESCE(SUM(CASE WHEN s.status = 'VOIDED' THEN s.total_amount ELSE 0 END), 0) AS refunds,
                COALESCE(SUM(CASE WHEN s.status = 'COMPLETED' THEN s.discount_amount ELSE 0 END), 0) AS discounts
         FROM sales s LEFT JOIN users u ON u.id = s.cashier_id
         WHERE ${where}
         GROUP BY s.cashier_id, u.name
         ORDER BY sales DESC`,
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
      return rows.map((r) => ({
        cashierId: r.cashierId,
        name: r.name || '—',
        shifts: Number(r.shifts ?? 0),
        transactions: Number(r.transactions ?? 0),
        sales: this.roundMoney(Number(r.sales ?? 0)),
        refunds: this.roundMoney(Number(r.refunds ?? 0)),
        discounts: this.roundMoney(Number(r.discounts ?? 0)),
      }))
    } catch (error) {
      return this.handleServiceError('getCashierRoster', error, { businessId })
    }
  }

  private rangeWhere(query: { dateFrom?: string; dateTo?: string }): {
    where: string
    params: unknown[]
  } {
    const params: unknown[] = []
    const conds = ['s.business_id = $1', 's.deleted_at IS NULL']
    params.push('')
    if (query.dateFrom) {
      params.push(query.dateFrom)
      conds.push(`s.sale_date >= $${params.length}`)
    }
    if (query.dateTo) {
      params.push(query.dateTo)
      conds.push(`s.sale_date <= $${params.length}`)
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
      const { where, params } = this.rangeWhere(query)
      params[0] = businessId
      const rows = (await this.salesRepo.manager.query(
        `SELECT si.product_id AS "productId", si.product_name AS name, c.name AS category,
                COALESCE(SUM(si.quantity), 0) AS quantity,
                COALESCE(SUM(si.line_total), 0) AS revenue,
                COALESCE(SUM(COALESCE(si.cost_price, 0) * si.quantity), 0) AS cogs
         FROM sale_items si
           JOIN sales s ON s.id = si.sale_id
           LEFT JOIN products p ON p.id = si.product_id
           LEFT JOIN product_categories c ON c.id = p.category_id
         WHERE ${where} AND s.status = 'COMPLETED' AND si.deleted_at IS NULL
         GROUP BY si.product_id, si.product_name, c.name
         ORDER BY revenue DESC`,
        params,
      )) as Array<{
        productId: string
        name: string
        category: string | null
        quantity: string
        revenue: string
        cogs: string
      }>
      return rows.map((r) => ({
        productId: r.productId,
        name: r.name,
        category: r.category ?? null,
        quantity: Number(r.quantity ?? 0),
        revenue: this.roundMoney(Number(r.revenue ?? 0)),
        cogs: this.roundMoney(Number(r.cogs ?? 0)),
      }))
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
      const { where, params } = this.rangeWhere(query)
      params[0] = businessId
      const rows = (await this.salesRepo.manager.query(
        `SELECT sp.method AS method,
                COUNT(DISTINCT sp.sale_id)::int AS transactions,
                COALESCE(SUM(sp.amount), 0) AS amount
         FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id
         WHERE ${where} AND s.status = 'COMPLETED'
         GROUP BY sp.method
         ORDER BY amount DESC`,
        params,
      )) as Array<{ method: string; transactions: number; amount: string }>
      return rows.map((r) => ({
        method: r.method,
        transactions: Number(r.transactions ?? 0),
        amount: this.roundMoney(Number(r.amount ?? 0)),
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
      const byReason = (await this.salesRepo.manager.query(
        `SELECT s.void_reason AS reason, COUNT(*)::int AS count, COALESCE(SUM(s.total_amount), 0) AS amount
         FROM sales s WHERE ${where} AND s.status = 'VOIDED'
         GROUP BY s.void_reason ORDER BY amount DESC`,
        params,
      )) as Array<{ reason: string | null; count: number; amount: string }>
      const byCashier = (await this.salesRepo.manager.query(
        `SELECT s.cashier_id AS "cashierId", COALESCE(u.name, '') AS name,
                COALESCE(SUM(CASE WHEN s.status = 'VOIDED' THEN s.total_amount ELSE 0 END), 0) AS refunds,
                COALESCE(SUM(CASE WHEN s.status = 'COMPLETED' THEN s.total_amount ELSE 0 END), 0) AS sales
         FROM sales s LEFT JOIN users u ON u.id = s.cashier_id
         WHERE ${where} AND s.status IN ('VOIDED', 'COMPLETED')
         GROUP BY s.cashier_id, u.name
         HAVING SUM(CASE WHEN s.status = 'VOIDED' THEN 1 ELSE 0 END) > 0
         ORDER BY refunds DESC`,
        params,
      )) as Array<{ cashierId: string; name: string; refunds: string; sales: string }>
      const [gross] = (await this.salesRepo.manager.query(
        `SELECT COALESCE(SUM(s.total_amount), 0) AS gross FROM sales s WHERE ${where} AND s.status = 'COMPLETED'`,
        params,
      )) as Array<{ gross: string }>
      return {
        byReason: byReason.map((r) => ({
          reason: r.reason ?? null,
          count: Number(r.count ?? 0),
          amount: this.roundMoney(Number(r.amount ?? 0)),
        })),
        byCashier: byCashier.map((r) => ({
          cashierId: r.cashierId,
          name: r.name || '—',
          refunds: this.roundMoney(Number(r.refunds ?? 0)),
          sales: this.roundMoney(Number(r.sales ?? 0)),
        })),
        grossSales: this.roundMoney(Number(gross?.gross ?? 0)),
      }
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
      const { where, params } = this.rangeWhere(query)
      params[0] = businessId
      const [row] = (await this.salesRepo.manager.query(
        `SELECT COALESCE(SUM(si.line_total), 0) AS revenue,
                COALESCE(SUM(COALESCE(si.cost_price, 0) * si.quantity), 0) AS cogs
         FROM sale_items si JOIN sales s ON s.id = si.sale_id
         WHERE ${where} AND s.status = 'COMPLETED' AND si.deleted_at IS NULL`,
        params,
      )) as Array<{ revenue: string; cogs: string }>
      return {
        revenue: this.roundMoney(Number(row?.revenue ?? 0)),
        cogs: this.roundMoney(Number(row?.cogs ?? 0)),
      }
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
      if (
        ![BusinessMemberRole.OWNER, BusinessMemberRole.MANAGER].includes(
          user.role as BusinessMemberRole,
        )
      ) {
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

        if (sale.status === SaleStatus.VOIDED) {
          throw new AppBadRequestException(
            await this.i18n.translate('errors.already_voided', {
              args: { saleNumber: sale.saleNumber },
            }),
            'ALREADY_VOIDED',
          )
        }

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
            (sale.items ?? []).map((item) => ({
              productId: item.productId,
              variantId: item.variantId ?? null,
              productName: item.productName,
              quantity: item.quantity,
            })),
          ),
          manager,
        )

        await this.releaseSerialUnitsForVoid(manager, businessId, sale.items ?? [])

        await this.dailySummaryService.decrementForVoid(
          sale,
          sale.items ?? [],
          sale.payments ?? [],
          manager,
        )

        await this.debtsService.writeOffSourceDebt(manager, {
          businessId,
          sourceType: DebtSource.SALE,
          sourceId: sale.id,
          reason: `Sale ${sale.saleNumber} was voided: ${dto.reason.trim()}`,
          writtenOffAt: new Date(),
          writtenOffById: user.sub,
        })
      })

      const result = await this.findById(id, businessId)
      if (context) {
        this.auditService.log(context, {
          action: 'VOID',
          entityType: 'sale',
          entityId: id,
          entityLabel: result.saleNumber,
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

        const amount = this.roundMoney(input.amount)
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
            recordedById: user.sub,
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
          recordedById: user.sub,
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
        // Resolve returned lines: explicit selection, else the whole sale (full return).
        const returnedLines =
          input.items && input.items.length > 0
            ? input.items.map((r) => {
                const item = saleItems.find((si) => si.id === r.saleItemId)
                if (!item) {
                  throw new AppBadRequestException(
                    'Returned line does not belong to this sale.',
                    'RETURN_ITEM_NOT_FOUND',
                  )
                }
                return {
                  item,
                  quantity: Math.min(this.roundMoney(r.quantity), item.quantity),
                  serialUnitId: r.serialUnitId ?? item.serialUnitId ?? null,
                }
              })
            : saleItems.map((item) => ({
                item,
                quantity: item.quantity,
                serialUnitId: item.serialUnitId ?? null,
              }))

        const isFullReturn =
          !input.items ||
          input.items.length === 0 ||
          saleItems.every((si) => {
            const returnedQty = returnedLines
              .filter((r) => r.item.id === si.id)
              .reduce((sum, r) => sum + r.quantity, 0)
            return returnedQty >= si.quantity
          })

        // Money to return: default to the goods value of returned lines, capped at amountPaid
        // (fees are non-refundable by default). Unpaid COD returns refund 0 and write off the debt.
        const goodsValue = this.roundMoney(
          returnedLines.reduce((sum, r) => {
            const perUnit =
              r.item.quantity > 0 ? r.item.lineTotal / r.item.quantity : r.item.lineTotal
            return sum + perUnit * r.quantity
          }, 0),
        )
        const requested = input.amount != null ? this.roundMoney(input.amount) : goodsValue
        const moneyRefund = this.roundMoney(Math.min(Math.max(0, requested), sale.amountPaid))
        const restock = input.restock !== false
        const now = new Date()

        const returnId = randomUUID()
        const returnRepo = manager.getRepository(SaleReturn)
        await returnRepo.save(
          returnRepo.create({
            id: returnId,
            saleId: sale.id,
            businessId,
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

        const settlement = await this.recomputeSaleSettlement(manager, sale.id, sale.totalAmount)
        await manager.getRepository(Sale).update(sale.id, {
          amountPaid: settlement.amountPaid,
          creditAmount: settlement.creditAmount,
          status: isFullReturn ? SaleStatus.REFUNDED : SaleStatus.PARTIALLY_REFUNDED,
        })

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

  /** Recompute a sale's paid/credit from its signed payment ledger: Σ(PAYMENT) − Σ(REFUND). */
  private async recomputeSaleSettlement(
    manager: EntityManager,
    saleId: string,
    totalAmount: number,
  ): Promise<{ amountPaid: number; creditAmount: number }> {
    const rows = await manager.getRepository(SalePayment).find({ where: { saleId } })
    const net = rows.reduce(
      (sum, p) => sum + (p.kind === SalePaymentKind.REFUND ? -Number(p.amount) : Number(p.amount)),
      0,
    )
    const amountPaid = this.roundMoney(Math.max(0, net))
    const creditAmount = this.roundMoney(Math.max(0, totalAmount - amountPaid))
    return { amountPaid, creditAmount }
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
            ? this.roundMoney((summary.grossProfit / summary.totalRevenue) * 100)
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
        .andWhere('sale.sale_date = :date', { date })
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
          voidAmount = this.roundMoney(voidAmount + saleTotal)
        } else if (isCompleted) {
          transactionCount += 1
          shiftRevenue = this.roundMoney(shiftRevenue + saleTotal)

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
              this.roundMoney((paymentMap.get(payment.method) ?? 0) + payment.amount),
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
            totalAmount: this.roundMoney(saleTotal),
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
        avgOrderValue: transactionCount > 0 ? this.roundMoney(shiftRevenue / transactionCount) : 0,
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
   * Render the sale's receipt (shared @biztrack/templates template) to a PDF and dispatch
   * it to the customer over WhatsApp/email. Same pipeline as RFQ/PO sends (ProcurementSend).
   */
  async sendReceipt(
    id: string,
    businessId: string,
    dto: SendSaleReceiptDto,
    context?: AuditContext,
  ): Promise<{ pdfUrl: string }> {
    try {
      const { sale, business } = await this.getReceipt(id, businessId)
      const receipt = SaleReceiptDto.fromSale(sale, business)
      const locale = dto.locale?.trim() || 'fr'
      const html = renderSaleReceiptHtml(receipt, { labels: saleReceiptLabels(locale), locale })

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
      if (
        !unit ||
        unit.productId !== product.id ||
        (unit.status !== SerialUnitStatus.IN_STOCK && unit.status !== SerialUnitStatus.RESERVED)
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
    const typeById = new Map(products.map((product) => [product.id, product.productType]))
    // Serialised products have no inventory_levels row — stock is the unit count,
    // handled by marking the serial unit SOLD, so they're excluded from deduction.
    const serializedIds = new Set(
      products.filter((product) => product.isSerialized).map((product) => product.id),
    )
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

    const expanded: Array<{
      productId: string
      variantId?: string | null
      productName: string
      quantity: number
      movementId?: string | null
    }> = []
    for (const line of lines) {
      if (serializedIds.has(line.productId)) {
        continue
      }
      if (typeById.get(line.productId) === ProductType.COMPOSITE) {
        for (const component of componentsByBundle.get(line.productId) ?? []) {
          expanded.push({
            productId: component.componentProductId,
            variantId: null,
            productName: line.productName,
            quantity: component.quantity * line.quantity,
          })
        }
      } else {
        expanded.push(line)
      }
    }
    return expanded
  }

  /** Mark a sale's serialised units SOLD (Phase 3G). Runs in the sale transaction. */
  private async markSerialUnitsSold(
    manager: EntityManager,
    businessId: string,
    saleId: string,
    customerId: string | null,
    items: Array<{ id: string; serialUnitId?: string | null }>,
  ): Promise<void> {
    const repo = manager.getRepository(ProductSerialUnit)
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
        throw new AppBadRequestException(
          await this.i18n.translate('errors.serial_unit_unavailable'),
          'SERIAL_UNIT_UNAVAILABLE',
        )
      }
    }
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
    const items: ComputedSaleItem[] = []
    let subtotal = 0
    let priceDriftWarning = false

    for (const input of dto.items) {
      const product = productsById.get(input.productId)

      if (!product) {
        throw new AppBadRequestException(
          'Product not found in sale payload.',
          'PRODUCT_NOT_FOUND',
          { productId: input.productId },
        )
      }

      const quantity = this.roundQuantity(input.quantity)
      const unitPrice = this.roundMoney(input.unitPrice)
      const discountAmount = this.roundMoney(input.discountAmount ?? 0)
      const lineTotal = Math.max(0, this.roundMoney(unitPrice * quantity - discountAmount))
      const costPrice =
        input.costPrice !== undefined
          ? this.roundMoney(input.costPrice)
          : (product.costPrice ?? null)

      if (this.hasPriceDrift(unitPrice, product.sellingPrice)) {
        priceDriftWarning = true
      }

      const variant = input.variantId ? variantsById.get(input.variantId) : undefined
      const serialUnit = input.serialUnitId ? serialUnitsById.get(input.serialUnitId) : undefined
      subtotal = this.roundMoney(subtotal + lineTotal)
      items.push({
        product,
        // Serialised lines have no explicit variantId — derive it from the serial unit so the
        // sale item still records the correct variant.
        variantId: variant?.id ?? serialUnit?.variantId ?? null,
        variantName: variant?.name ?? input.variantName ?? null,
        serialUnitId: serialUnit?.id ?? input.serialUnitId ?? null,
        serialNumber: serialUnit?.serialNumber ?? input.serialNumber ?? null,
        quantity,
        unitPrice,
        discountAmount,
        lineTotal,
        costPrice,
      })
    }

    const saleDiscountAmount = Math.min(this.roundMoney(dto.discountAmount ?? 0), subtotal)
    const saleChargesAmount = this.roundMoney(Math.max(0, dto.chargesAmount ?? 0))
    const totalAmount = Math.max(
      0,
      this.roundMoney(subtotal - saleDiscountAmount + saleChargesAmount),
    )

    return {
      items,
      subtotal,
      saleDiscountAmount,
      saleChargesAmount,
      totalAmount,
      priceDriftWarning,
    }
  }

  private hasPriceDrift(unitPrice: number, currentSellingPrice: number) {
    if (currentSellingPrice <= 0) {
      return unitPrice > 0
    }

    return Math.abs(unitPrice - currentSellingPrice) / currentSellingPrice > 0.1
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
        (sale.items ?? []).map((item) => ({
          productId: item.productId,
          variantId: item.variantId ?? null,
          productName: item.productName,
          quantity: item.quantity,
        })),
      ),
      manager,
    )

    await this.releaseSerialUnitsForVoid(manager, businessId, sale.items ?? [])

    await this.dailySummaryService.decrementForVoid(
      sale,
      sale.items ?? [],
      sale.payments ?? [],
      manager,
    )

    await this.debtsService.writeOffSourceDebt(manager, {
      businessId,
      sourceType: DebtSource.SALE,
      sourceId: sale.id,
      reason: `Sale ${sale.saleNumber} was voided from sync.`,
      writtenOffAt: voidedAt,
      writtenOffById: voidedById,
    })

    for (const payment of sale.payments ?? []) {
      if (payment.method === PaymentMethod.SAVINGS && payment.savingsAccountId) {
        await this.savingsService.createVoidedSaleTransaction(
          businessId,
          payment.savingsAccountId,
          sale.id,
          payment.amount,
          voidedAt,
        )
      }
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

  private async resolveSaleCreditContext(
    manager: EntityManager,
    businessId: string,
    rawCustomerId: string | null | undefined,
    totalAmount: number,
    amountPaid: number,
    expectedCreditAmount?: number | null,
  ) {
    const customerId = this.normalizeOptionalUuid(rawCustomerId)
    const creditAmount = this.roundMoney(Math.max(0, totalAmount - amountPaid))

    if (
      expectedCreditAmount !== undefined &&
      expectedCreditAmount !== null &&
      this.roundMoney(expectedCreditAmount) !== creditAmount
    ) {
      throw new AppBadRequestException(
        'Sale credit amount does not match the unpaid balance.',
        'SALE_CREDIT_AMOUNT_MISMATCH',
        {
          expectedCreditAmount,
          computedCreditAmount: creditAmount,
        },
      )
    }

    if (creditAmount > 0 && !customerId) {
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

  private normalizeSyncSaleStatus(value?: SaleStatus | null) {
    return value === SaleStatus.VOIDED ? SaleStatus.VOIDED : SaleStatus.COMPLETED
  }

  private roundMoney(value: number) {
    return Math.round(value * 100) / 100
  }

  private roundQuantity(value: number) {
    return Math.round(value * 1000) / 1000
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

  private deriveStoredPaymentMethod(payments: Array<{ method: PaymentMethod }>): PaymentMethod {
    const methods = [...new Set(payments.map((payment) => payment.method))]

    if (methods.length === 0) {
      return PaymentMethod.MIXED
    }

    if (methods.length === 1) {
      return methods[0]!
    }

    return PaymentMethod.MIXED
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
