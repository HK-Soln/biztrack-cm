import { randomUUID } from 'crypto'
import type { DataSource } from 'typeorm'
import {
  ReviewFlagCode,
  ReviewFlagSeverity,
  ReviewFlagStatus,
  SaleStatus,
  type SaleSyncPayload,
} from '@biztrack/types'
import {
  closeIntegrationDataSource,
  getIntegrationDataSource,
} from '@/testing/integration-database'
import {
  createSalesSyncHarness,
  type RoleLimits,
  type SalesSyncHarness,
} from '@/testing/sales-sync-harness'

// What the server does with sales, refunds and voids that sync up from a till — against a
// real Postgres, with the real sales, inventory, debts and daily-summary services. These are
// the paths where the server accepts what an offline till did and flags what it disagrees
// with (rulings R1–R7, docs/design/domain-package.md).

const SOLD_AT = '2026-09-01T10:00:00.000Z'
const SALE_DAY = '2026-09-01'
const REFUNDED_AT = '2026-09-03T09:00:00.000Z'
const REFUND_DAY = '2026-09-03'

describe('sales synced from a till', () => {
  let dataSource: DataSource
  let h: SalesSyncHarness

  beforeAll(async () => {
    dataSource = await getIntegrationDataSource()
  })
  afterAll(async () => {
    await closeIntegrationDataSource()
  })
  beforeEach(async () => {
    h = await createSalesSyncHarness(dataSource)
  })

  const count = async (sql: string, params: unknown[]) =>
    Number(((await dataSource.query(sql, params)) as Array<{ n: string }>)[0]?.n ?? 0)

  describe('a sale', () => {
    it('is recorded with its stock deduction and daily summary', async () => {
      const product = await h.seedProduct({ price: 1000, cost: 600, stock: 10 })
      const payload = h.salePayload({
        items: [{ productId: product, quantity: 2, unitPrice: 1000 }],
        soldAt: SOLD_AT,
      })

      const sale = await h.sales.createFromSync(h.businessId, payload)

      expect(sale.status).toBe(SaleStatus.COMPLETED)
      expect(sale.totalAmount).toBe(2000)
      expect(sale.amountPaid).toBe(2000)
      expect(sale.changeGiven).toBe(0)
      expect(await h.stockOf(product)).toBe(8)
      expect(await h.summaryOf(SALE_DAY)).toMatchObject({
        totalSales: 1,
        totalRevenue: 2000,
        totalCost: 1200,
        grossProfit: 800,
        totalRefunds: 0,
      })
      expect(await h.flagsOf(payload.saleId)).toEqual([])
    })

    it('is applied once when the till pushes it again', async () => {
      const product = await h.seedProduct({ price: 1000, cost: 600, stock: 10 })
      const payload = h.salePayload({
        items: [{ productId: product, quantity: 2, unitPrice: 1000 }],
        soldAt: SOLD_AT,
      })

      await h.sales.createFromSync(h.businessId, payload)
      await h.sales.createFromSync(h.businessId, payload)

      expect(await h.stockOf(product)).toBe(8)
      expect((await h.summaryOf(SALE_DAY))?.totalSales).toBe(1)
    })
  })

  describe('stock the server does not have (R3)', () => {
    it('accepts the sale, lets stock go negative and flags it', async () => {
      const product = await h.seedProduct({ price: 1000, cost: 600, stock: 1 })
      const payload = h.salePayload({
        items: [{ productId: product, quantity: 3, unitPrice: 1000 }],
        soldAt: SOLD_AT,
      })

      const sale = await h.sales.createFromSync(h.businessId, payload)

      expect(sale.status).toBe(SaleStatus.COMPLETED)
      expect(await h.stockOf(product)).toBe(-2)
      const flags = await h.flagsOf(payload.saleId)
      expect(flags).toHaveLength(1)
      expect(flags[0]).toMatchObject({
        code: ReviewFlagCode.NEGATIVE_STOCK,
        severity: ReviewFlagSeverity.MEDIUM,
        status: 'OPEN',
        details: { productId: product, available: 1, requested: 3, shortfall: 2 },
      })
      expect(h.notifications).toHaveLength(1)
    })

    it('does not raise the flag twice when the sale is pushed again', async () => {
      const product = await h.seedProduct({ price: 1000, stock: 1 })
      const payload = h.salePayload({
        items: [{ productId: product, quantity: 3, unitPrice: 1000 }],
      })

      await h.sales.createFromSync(h.businessId, payload)
      await h.sales.createFromSync(h.businessId, payload)

      expect(await h.flagsOf(payload.saleId)).toHaveLength(1)
      expect(await h.stockOf(product)).toBe(-2)
    })

    it('still rejects the same sale made online', async () => {
      const product = await h.seedProduct({ price: 1000, stock: 1 })

      await expect(
        h.sales.create(
          h.businessId,
          h.actor() as never,
          {
            clientId: '7b0c1a52-2f6e-4a8e-9a3c-2f1d0e9b7c11',
            soldAt: SOLD_AT,
            items: [{ productId: product, quantity: 3, unitPrice: 1000 }],
            payments: [{ method: 'CASH', amount: 3000 }],
          } as never,
        ),
      ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' })
      expect(await h.stockOf(product)).toBe(1)
    })

    it('accepts a serial unit already sold elsewhere and flags the conflict', async () => {
      const product = await h.seedProduct({ price: 50000, cost: 40000 })
      const unit = await h.seedSerialUnit(product, 'IMEI-0001')
      const first = h.salePayload({
        items: [{ productId: product, quantity: 1, unitPrice: 50000, serialUnitId: unit }],
      })
      const second = h.salePayload({
        items: [{ productId: product, quantity: 1, unitPrice: 50000, serialUnitId: unit }],
      })

      await h.sales.createFromSync(h.businessId, first)
      const sale = await h.sales.createFromSync(h.businessId, second)

      expect(sale.status).toBe(SaleStatus.COMPLETED)
      expect(await h.flagsOf(first.saleId)).toEqual([])
      const flags = await h.flagsOf(second.saleId)
      expect(flags).toHaveLength(1)
      expect(flags[0]).toMatchObject({
        code: ReviewFlagCode.SERIAL_ALREADY_SOLD,
        severity: ReviewFlagSeverity.HIGH,
        details: { serialUnitId: unit, serialNumber: 'IMEI-0001', soldOnSaleId: first.saleId },
      })
      // The unit stays with the sale that already holds it.
      const [row] = (await dataSource.query(
        `SELECT sale_id, status FROM product_serial_units WHERE id = $1`,
        [unit],
      )) as Array<{ sale_id: string; status: string }>
      expect(row).toMatchObject({ sale_id: first.saleId, status: 'SOLD' })
    })
  })

  describe('a refund', () => {
    const soldTwo = async () => {
      const product = await h.seedProduct({ price: 1000, cost: 600, stock: 10 })
      const payload = h.salePayload({
        items: [{ productId: product, quantity: 2, unitPrice: 1000 }],
        soldAt: SOLD_AT,
      })
      await h.sales.createFromSync(h.businessId, payload)
      return { product, payload, itemId: payload.items[0]!.id }
    }

    it('is booked on the day it was made at the till, at the value charged (R4, R7)', async () => {
      const { product, payload, itemId } = await soldTwo()

      const sale = await h.sales.createFromSync(
        h.businessId,
        h.withReturn(payload, {
          items: [{ saleItemId: itemId, quantity: 1 }],
          refundAmount: 1000,
          createdAt: REFUNDED_AT,
          businessDate: REFUND_DAY,
        }),
      )

      expect(sale.status).toBe(SaleStatus.PARTIALLY_REFUNDED)
      expect(sale.amountPaid).toBe(1000)
      expect(await h.stockOf(product)).toBe(9)
      expect(await h.flagsOf(payload.saleId)).toEqual([])

      // The sale day keeps the sale; the refund comes off its own day.
      expect(await h.summaryOf(SALE_DAY)).toMatchObject({ totalRevenue: 2000, totalCost: 1200 })
      expect(await h.summaryOf(REFUND_DAY)).toMatchObject({
        totalRevenue: -1000,
        totalCost: -600,
        grossProfit: -400,
        totalRefunds: 1000,
      })
      const [ret] = (await dataSource.query(
        `SELECT business_date::text AS business_date, refund_amount FROM sale_returns WHERE sale_id = $1`,
        [payload.saleId],
      )) as Array<{ business_date: string; refund_amount: string }>
      expect(ret).toMatchObject({ business_date: REFUND_DAY })
      expect(Number(ret?.refund_amount)).toBe(1000)

      // The Income Statement agrees with the summary.
      expect(await h.sales.getGrossProfit(h.businessId, {})).toEqual({ revenue: 1000, cogs: 600 })
      expect(
        await h.sales.getGrossProfit(h.businessId, { dateFrom: SALE_DAY, dateTo: SALE_DAY }),
      ).toEqual({ revenue: 2000, cogs: 1200 })
      expect(
        await h.sales.getGrossProfit(h.businessId, { dateFrom: REFUND_DAY, dateTo: REFUND_DAY }),
      ).toEqual({ revenue: -1000, cogs: -600 })
    })

    it('keeps the cost when the goods were not put back into stock', async () => {
      const { product, payload, itemId } = await soldTwo()

      await h.sales.createFromSync(
        h.businessId,
        h.withReturn(payload, {
          items: [{ saleItemId: itemId, quantity: 1 }],
          refundAmount: 1000,
          restock: false,
          createdAt: REFUNDED_AT,
        }),
      )

      expect(await h.stockOf(product)).toBe(8)
      expect(await h.summaryOf(REFUND_DAY)).toMatchObject({ totalRevenue: -1000, totalCost: 0 })
      expect(await h.sales.getGrossProfit(h.businessId, {})).toEqual({ revenue: 1000, cogs: 1200 })
    })

    it('keeps the amount the till handed back and flags one above what was paid (R1)', async () => {
      const { payload, itemId } = await soldTwo()

      const sale = await h.sales.createFromSync(
        h.businessId,
        h.withReturn(payload, {
          items: [{ saleItemId: itemId, quantity: 1 }],
          refundAmount: 5000,
          createdAt: REFUNDED_AT,
        }),
      )

      expect(sale.amountPaid).toBe(0)
      const [ret] = (await dataSource.query(
        `SELECT refund_amount FROM sale_returns WHERE sale_id = $1`,
        [payload.saleId],
      )) as Array<{ refund_amount: string }>
      expect(Number(ret?.refund_amount)).toBe(5000)
      expect(
        await count(
          `SELECT COALESCE(SUM(amount), 0) AS n FROM sale_payments WHERE sale_id = $1 AND kind = 'REFUND'`,
          [payload.saleId],
        ),
      ).toBe(5000)

      const flags = await h.flagsOf(payload.saleId)
      expect(flags).toHaveLength(1)
      expect(flags[0]).toMatchObject({
        code: ReviewFlagCode.REFUND_EXCEEDS_PAID,
        severity: ReviewFlagSeverity.HIGH,
        details: { refundAmount: 5000, amountPaid: 2000, excess: 3000 },
      })
      expect(h.notifications.at(-1)).toMatchObject({ urgent: true })
      // The goods value, not the till's amount, is what comes off revenue.
      expect(await h.summaryOf(REFUND_DAY)).toMatchObject({ totalRevenue: -1000 })
    })

    it('flags a refund above the value of the goods as medium', async () => {
      const { payload, itemId } = await soldTwo()

      await h.sales.createFromSync(
        h.businessId,
        h.withReturn(payload, {
          items: [{ saleItemId: itemId, quantity: 1 }],
          refundAmount: 1500,
          createdAt: REFUNDED_AT,
        }),
      )

      const flags = await h.flagsOf(payload.saleId)
      expect(flags.map((f) => [f.code, f.severity])).toEqual([
        [ReviewFlagCode.REFUND_AMOUNT_MISMATCH, ReviewFlagSeverity.MEDIUM],
      ])
    })

    it('records the money and flags a return whose line is not on the sale', async () => {
      const { product, payload } = await soldTwo()

      await h.sales.createFromSync(
        h.businessId,
        h.withReturn(payload, {
          items: [{ saleItemId: '11111111-2222-4333-8444-555555555555', quantity: 1 }],
          refundAmount: 1000,
          createdAt: REFUNDED_AT,
        }),
      )

      // No goods came back, but the cash left the drawer: the payment is on record.
      expect(await h.stockOf(product)).toBe(8)
      expect(
        await count(
          `SELECT COALESCE(SUM(amount), 0) AS n FROM sale_payments WHERE sale_id = $1 AND kind = 'REFUND'`,
          [payload.saleId],
        ),
      ).toBe(1000)
      const flags = await h.flagsOf(payload.saleId)
      expect(flags.map((f) => f.code).sort()).toEqual([
        ReviewFlagCode.REFUND_AMOUNT_MISMATCH,
        ReviewFlagCode.REFUND_QUANTITY_MISMATCH,
      ])
    })

    it('is applied once, and a second return that brings back the rest completes the sale (R5)', async () => {
      const { product, payload, itemId } = await soldTwo()
      const once = h.withReturn(payload, {
        items: [{ saleItemId: itemId, quantity: 1 }],
        refundAmount: 1000,
        createdAt: REFUNDED_AT,
      })
      await h.sales.createFromSync(h.businessId, once)
      await h.sales.createFromSync(h.businessId, once)
      expect(
        await count(`SELECT COUNT(*) AS n FROM sale_returns WHERE sale_id = $1`, [payload.saleId]),
      ).toBe(1)
      expect(await h.stockOf(product)).toBe(9)

      // The till sends every return of the sale; the first is already on record.
      const sale = await h.sales.createFromSync(
        h.businessId,
        h.withReturn(
          once,
          {
            items: [{ saleItemId: itemId, quantity: 1 }],
            refundAmount: 1000,
            createdAt: REFUNDED_AT,
          },
          'PARTIALLY_REFUNDED',
        ),
      )

      // Decided by quantity returned, not by the status the till sent.
      expect(sale.status).toBe(SaleStatus.REFUNDED)
      expect(sale.amountPaid).toBe(0)
      expect(
        await count(`SELECT COUNT(*) AS n FROM sale_returns WHERE sale_id = $1`, [payload.saleId]),
      ).toBe(2)
      expect(await h.stockOf(product)).toBe(10)
      expect(await h.sales.getGrossProfit(h.businessId, {})).toEqual({ revenue: 0, cogs: 0 })
    })
  })

  describe('sales reports net of refunds (R19)', () => {
    const soldTwoReturnedOne = async () => {
      const product = await h.seedProduct({ price: 1000, cost: 600, stock: 10 })
      const payload = h.salePayload({
        items: [{ productId: product, quantity: 2, unitPrice: 1000 }],
        soldAt: SOLD_AT,
      })
      await h.sales.createFromSync(h.businessId, payload)
      await h.sales.createFromSync(
        h.businessId,
        h.withReturn(payload, {
          items: [{ saleItemId: payload.items[0]!.id, quantity: 1 }],
          refundAmount: 1000,
          createdAt: REFUNDED_AT,
          businessDate: REFUND_DAY,
          reason: 'Damaged',
        }),
      )
      return payload
    }

    it('period summary: the sale still counts, less the goods returned', async () => {
      await soldTwoReturnedOne()
      expect(await h.sales.getRangeSummary(h.businessId, {})).toMatchObject({
        revenue: 1000,
        transactions: 1,
        averageBasket: 1000,
        itemsSold: 1,
        refundCount: 1,
        refundAmount: 1000,
      })
      expect(
        await h.sales.getRangeSummary(h.businessId, { dateFrom: SALE_DAY, dateTo: SALE_DAY }),
      ).toMatchObject({ revenue: 2000, itemsSold: 2, refundCount: 0 })
    })

    it('daily series: the return comes off the day of the refund', async () => {
      await soldTwoReturnedOne()
      const rows = await h.sales.getDailySeries(h.businessId, {})
      expect(rows.find((r) => r.date === SALE_DAY)).toMatchObject({
        transactions: 1,
        total: 2000,
        cash: 2000,
      })
      expect(rows.find((r) => r.date === REFUND_DAY)).toMatchObject({
        transactions: 0,
        total: -1000,
      })
      // The cash handed back comes off the day it was paid out.
      expect(rows.reduce((sum, r) => sum + r.cash, 0)).toBe(1000)
    })

    it('cashier roster and refunds report: the return is the selling cashier’s', async () => {
      const payload = await soldTwoReturnedOne()
      expect(await h.sales.getCashierRoster(h.businessId, {})).toEqual([
        expect.objectContaining({
          cashierId: payload.cashierId,
          transactions: 1,
          sales: 1000,
          refunds: 1000,
        }),
      ])
      expect(await h.sales.getRefundsSummary(h.businessId, {})).toEqual({
        byReason: [{ reason: 'Damaged', count: 1, amount: 1000 }],
        byCashier: [
          expect.objectContaining({ cashierId: payload.cashierId, refunds: 1000, sales: 2000 }),
        ],
        grossSales: 2000,
      })
    })
  })

  describe('a void after refunds (R6)', () => {
    const soldTwoReturnedOne = async () => {
      const product = await h.seedProduct({ price: 1000, cost: 600, stock: 10 })
      const payload = h.salePayload({
        items: [{ productId: product, quantity: 2, unitPrice: 1000 }],
        soldAt: SOLD_AT,
      })
      await h.sales.createFromSync(h.businessId, payload)
      const refunded = h.withReturn(payload, {
        items: [{ saleItemId: payload.items[0]!.id, quantity: 1 }],
        refundAmount: 1000,
        createdAt: REFUNDED_AT,
      })
      await h.sales.createFromSync(h.businessId, refunded)
      return { product, payload, refunded }
    }

    it('voids only the balance of a partly refunded sale', async () => {
      const { product, payload } = await soldTwoReturnedOne()

      const sale = await h.sales.void(payload.saleId, h.businessId, h.actor() as never, {
        reason: 'Customer cancelled the rest',
      })

      expect(sale.status).toBe(SaleStatus.VOIDED)
      // 10 − 2 sold + 1 returned + 1 voided: only what was still sold comes back.
      expect(await h.stockOf(product)).toBe(10)
      // Sale day: 2000 − the 1000 balance. Refund day: −1000. The sale nets to zero.
      expect(await h.summaryOf(SALE_DAY)).toMatchObject({ totalRevenue: 1000, totalCost: 600 })
      expect(await h.summaryOf(REFUND_DAY)).toMatchObject({ totalRevenue: -1000, totalCost: -600 })
      expect(await h.sales.getGrossProfit(h.businessId, {})).toEqual({ revenue: 0, cogs: 0 })
    })

    it('applies the same rule to a void synced from the till', async () => {
      const { product, refunded } = await soldTwoReturnedOne()

      const sale = await h.sales.createFromSync(h.businessId, {
        ...refunded,
        status: SaleStatus.VOIDED,
        voidReason: 'Customer cancelled the rest',
      })

      expect(sale.status).toBe(SaleStatus.VOIDED)
      expect(await h.stockOf(product)).toBe(10)
      expect(await h.summaryOf(SALE_DAY)).toMatchObject({ totalRevenue: 1000, totalCost: 600 })
    })

    it('refuses to void a fully refunded sale', async () => {
      const product = await h.seedProduct({ price: 1000, cost: 600, stock: 10 })
      const payload = h.salePayload({
        items: [{ productId: product, quantity: 2, unitPrice: 1000 }],
        soldAt: SOLD_AT,
      })
      await h.sales.createFromSync(h.businessId, payload)
      await h.sales.createFromSync(
        h.businessId,
        h.withReturn(
          payload,
          {
            items: [{ saleItemId: payload.items[0]!.id, quantity: 2 }],
            refundAmount: 2000,
            createdAt: REFUNDED_AT,
          },
          'REFUNDED',
        ),
      )

      await expect(
        h.sales.void(payload.saleId, h.businessId, h.actor() as never, {
          reason: 'Trying to void a refunded sale',
        }),
      ).rejects.toMatchObject({ code: 'SALE_FULLY_REFUNDED' })
      expect((await h.saleRow(payload.saleId)).status).toBe(SaleStatus.REFUNDED)
      expect(await h.stockOf(product)).toBe(10)
    })
  })

  describe('review flags for the owner', () => {
    const oversold = async () => {
      const product = await h.seedProduct({ price: 1000, cost: 600, stock: 1 })
      const payload = h.salePayload({
        items: [{ productId: product, quantity: 3, unitPrice: 1000 }],
        soldAt: SOLD_AT,
      })
      await h.sales.createFromSync(h.businessId, payload)
      return payload
    }

    it('lists a flag with the sale number, and counts it as open', async () => {
      const payload = await oversold()

      const page = await h.reviewFlags.list(h.businessId, {})
      expect(page.total).toBe(1)
      expect(page.data[0]).toMatchObject({
        code: ReviewFlagCode.NEGATIVE_STOCK,
        status: ReviewFlagStatus.OPEN,
        entityId: payload.saleId,
        entityLabel: payload.saleNumber,
        resolvedByName: null,
      })
      expect(await h.reviewFlags.countOpen(h.businessId)).toEqual({ open: 1, high: 0 })
    })

    it('is resolved once, with a note and the name of who resolved it', async () => {
      await oversold()
      const [flag] = (await h.reviewFlags.list(h.businessId, {})).data

      const resolved = await h.reviewFlags.resolve(h.businessId, flag!.id, h.userId, ' Counted ')
      expect(resolved).toMatchObject({
        status: ReviewFlagStatus.RESOLVED,
        resolutionNote: 'Counted',
        resolvedById: h.userId,
      })
      expect(resolved.resolvedByName).toMatch(/^Owner /)

      // Resolving again keeps the first note.
      const again = await h.reviewFlags.resolve(h.businessId, flag!.id, h.userId, 'Other')
      expect(again.resolutionNote).toBe('Counted')
      expect(await h.reviewFlags.countOpen(h.businessId)).toEqual({ open: 0, high: 0 })
      expect(
        (await h.reviewFlags.list(h.businessId, { status: ReviewFlagStatus.OPEN })).total,
      ).toBe(0)
    })

    it('is for the owner and managers, not for a cashier', async () => {
      await expect(h.reviewFlags.assertCanReview(h.businessId, h.userId)).resolves.toBeUndefined()

      const cashier = await h.seedMember('CASHIER')
      await expect(h.reviewFlags.assertCanReview(h.businessId, cashier)).rejects.toMatchObject({
        code: 'REVIEW_FLAGS_FORBIDDEN',
      })
      const manager = await h.seedMember('MANAGER')
      await expect(h.reviewFlags.assertCanReview(h.businessId, manager)).resolves.toBeUndefined()
    })
  })

  describe('a discount (R2)', () => {
    const BEFORE_SALE = '2026-08-01T00:00:00.000Z'
    const LATER_BEFORE_SALE = '2026-08-20T00:00:00.000Z'
    const AFTER_SALE = '2026-09-02T00:00:00.000Z'

    // 2,000 off a 10,000 sale: 20%. The till says the discount needed nobody, unless told.
    const discounted = async (
      over: {
        unauthorized?: boolean
        authorizedBy?: string | null
        discountPolicy?: SaleSyncPayload['discountPolicy']
      } = {},
    ) => {
      const product = await h.seedProduct({ price: 10000, cost: 4000, stock: 10 })
      const payload = h.salePayload({
        items: [{ productId: product, quantity: 1, unitPrice: 10000 }],
        paid: 8000,
        soldAt: SOLD_AT,
        overrides: {
          discountAmount: 2000,
          discounts: [
            {
              id: randomUUID(),
              description: 'Remise',
              discountType: 'FIXED_AMOUNT' as never,
              amount: 2000,
              unauthorized: over.unauthorized ?? false,
              authorizedBy: over.authorizedBy ?? null,
            },
          ],
          discountPolicy: over.discountPolicy,
        },
      })
      const sale = await h.sales.createFromSync(h.businessId, payload)
      expect(sale.totalAmount).toBe(8000)
      return h.flagsOf(payload.saleId)
    }
    const cashierRole = async (limits: RoleLimits, effectiveFrom = BEFORE_SALE) => {
      const roleId = await h.seedRole({ ...limits, effectiveFrom })
      await h.assignRole(h.userId, roleId)
      return roleId
    }

    it('is flagged when it was over the limit in force and nobody approved it', async () => {
      const roleId = await cashierRole({ maxCartDiscountPercent: 10 })

      const flags = await discounted({ discountPolicy: { roleId, limitsVersion: 1 } })
      expect(flags).toHaveLength(1)
      expect(flags[0]).toMatchObject({
        code: ReviewFlagCode.DISCOUNT_UNAUTHORIZED,
        severity: ReviewFlagSeverity.MEDIUM,
        details: {
          reason: 'OVER_LIMIT',
          exceeded: ['CART_PERCENT'],
          discountTotal: 2000,
          subtotal: 10000,
          maxCartDiscountPercent: 10,
          limitsVersion: 1,
        },
      })
    })

    it('raises nothing when it was within the limit, or the till already marked it', async () => {
      await cashierRole({ maxCartDiscountPercent: 20 })
      expect(await discounted()).toHaveLength(0)

      h = await createSalesSyncHarness(dataSource)
      await cashierRole({ maxCartDiscountPercent: 10 })
      expect(await discounted({ unauthorized: true })).toHaveLength(0)
    })

    it('is checked against the limits at the time of the sale, not those of today', async () => {
      const roleId = await cashierRole({ maxCartDiscountPercent: 25 })
      // Tightened the day after the sale: the sale was valid when it was made.
      expect(await h.changeRoleLimits(roleId, { maxCartDiscountPercent: 10 }, AFTER_SALE)).toBe(2)

      expect(await discounted({ discountPolicy: { roleId, limitsVersion: 1 } })).toHaveLength(0)
    })

    it('is low when the till still had the limits from before a change', async () => {
      const roleId = await cashierRole({ maxCartDiscountPercent: 25 })
      await h.changeRoleLimits(roleId, { maxCartDiscountPercent: 10 }, LATER_BEFORE_SALE)

      const flags = await discounted({ discountPolicy: { roleId, limitsVersion: 1 } })
      expect(flags).toHaveLength(1)
      expect(flags[0]).toMatchObject({
        severity: ReviewFlagSeverity.LOW,
        details: { reason: 'TILL_OLD_LIMITS', limitsVersion: 2, tillLimitsVersion: 1 },
      })
      expect(h.notifications.at(-1)).toMatchObject({ urgent: false })

      // A till that names no version is taken to have had the version before.
      const unnamed = await discounted()
      expect(unnamed[0]).toMatchObject({
        severity: ReviewFlagSeverity.LOW,
        details: { reason: 'TILL_OLD_LIMITS', tillLimitsVersion: 1 },
      })
    })

    it('is the real flag when the till says it had the limits in force', async () => {
      const roleId = await cashierRole({ maxCartDiscountPercent: 25 })
      await h.changeRoleLimits(roleId, { maxCartDiscountPercent: 10 }, LATER_BEFORE_SALE)

      const flags = await discounted({ discountPolicy: { roleId, limitsVersion: 2 } })
      expect(flags[0]).toMatchObject({
        severity: ReviewFlagSeverity.MEDIUM,
        details: { reason: 'OVER_LIMIT' },
      })
    })

    it('accepts a manager approval only when the manager limit covered it', async () => {
      await cashierRole({ maxCartDiscountPercent: 10 })
      const manager = await h.seedMember('MANAGER')
      const managerRole = await h.seedRole({
        maxCartDiscountPercent: 15,
        effectiveFrom: BEFORE_SALE,
      })
      await h.assignRole(manager, managerRole)

      const flags = await discounted({ authorizedBy: manager })
      expect(flags).toHaveLength(1)
      expect(flags[0]).toMatchObject({
        severity: ReviewFlagSeverity.MEDIUM,
        details: { reason: 'APPROVER_LIMIT', maxCartDiscountPercent: 15, authorizedBy: manager },
      })

      const senior = await h.seedMember('MANAGER')
      await h.assignRole(senior, await h.seedRole({ effectiveFrom: BEFORE_SALE }))
      expect(await discounted({ authorizedBy: senior })).toHaveLength(0)
    })

    it('keeps the till verdict for a sale older than the recorded limits', async () => {
      await cashierRole({ maxCartDiscountPercent: 10 }, AFTER_SALE)
      expect(await discounted()).toHaveLength(0)
    })

    it('starts a new version only when the limits really change', async () => {
      const roleId = await h.seedRole({ maxCartDiscountPercent: 10, effectiveFrom: BEFORE_SALE })
      expect(await h.changeRoleLimits(roleId, { maxCartDiscountPercent: 10 }, AFTER_SALE)).toBe(1)
      expect(await h.changeRoleLimits(roleId, { allowBelowCost: true }, AFTER_SALE)).toBe(2)

      expect(await h.roleVersions(roleId)).toMatchObject([
        { version: 1, maxCartDiscountPercent: 10, allowBelowCost: false },
        { version: 2, maxCartDiscountPercent: 10, allowBelowCost: true },
      ])
    })
  })

  describe('a return when the customer owes on the sale (R9 to R11)', () => {
    // Ten units at 1,000 to a customer.
    const sold = async (paid: number) => {
      const product = await h.seedProduct({ price: 1000, cost: 600, stock: 20 })
      const customerId = await h.seedCustomer()
      const payload = h.salePayload({
        items: [{ productId: product, quantity: 10, unitPrice: 1000 }],
        paid,
        soldAt: SOLD_AT,
        overrides: { customerId, creditAmount: 10000 - paid },
      })
      await h.sales.createFromSync(h.businessId, payload)
      return payload
    }
    const refundedCash = (saleId: string) =>
      count(
        `SELECT COALESCE(SUM(amount), 0) AS n FROM sale_payments WHERE sale_id = $1 AND kind = 'REFUND'`,
        [saleId],
      )
    const refund = (payload: SaleSyncPayload, quantity: number) =>
      h.sales.refund(
        payload.saleId,
        h.businessId,
        h.actor() as never,
        {
          items: [{ saleItemId: payload.items[0]!.id, quantity }],
          reason: 'Customer brought it back',
        } as never,
      )

    it('a sale paid in full owes nothing after part of it is returned (R9)', async () => {
      const payload = await sold(10000)
      const sale = await refund(payload, 2)

      expect(await refundedCash(payload.saleId)).toBe(2000)
      expect(sale).toMatchObject({ amountPaid: 8000, creditAmount: 0 })
      expect(await h.debtOf(payload.saleId)).toBeNull()
    })

    it('takes the goods off the debt first, with no money handed back (R10)', async () => {
      const payload = await sold(4000)
      expect(await h.debtOf(payload.saleId)).toEqual({
        originalAmount: 6000,
        status: 'OUTSTANDING',
      })

      const sale = await refund(payload, 2)

      expect(await refundedCash(payload.saleId)).toBe(0)
      expect(sale).toMatchObject({ amountPaid: 4000, creditAmount: 4000 })
      expect(await h.debtOf(payload.saleId)).toEqual({
        originalAmount: 4000,
        status: 'OUTSTANDING',
      })
    })

    it('refunds only what is beyond the debt (R10)', async () => {
      const payload = await sold(4000)
      const sale = await refund(payload, 8)

      expect(await refundedCash(payload.saleId)).toBe(2000)
      expect(sale).toMatchObject({ amountPaid: 2000, creditAmount: 0 })
      expect(await h.debtOf(payload.saleId)).toEqual({ originalAmount: 0, status: 'SETTLED' })
    })

    it('applies the same rule to a return synced from a till', async () => {
      const payload = await sold(4000)
      await h.sales.createFromSync(
        h.businessId,
        h.withReturn(payload, {
          items: [{ saleItemId: payload.items[0]!.id, quantity: 2 }],
          refundAmount: 0,
          createdAt: REFUNDED_AT,
        }),
      )

      expect(await refundedCash(payload.saleId)).toBe(0)
      expect(await h.debtOf(payload.saleId)).toEqual({
        originalAmount: 4000,
        status: 'OUTSTANDING',
      })
      expect(await h.saleRow(payload.saleId)).toMatchObject({
        amountPaid: 4000,
        creditAmount: 4000,
      })
      expect(await h.flagsOf(payload.saleId)).toHaveLength(0)
    })

    it('keeps the money an older till handed back, and leaves the debt as it was', async () => {
      const payload = await sold(4000)
      await h.sales.createFromSync(
        h.businessId,
        h.withReturn(payload, {
          items: [{ saleItemId: payload.items[0]!.id, quantity: 2 }],
          refundAmount: 2000,
          createdAt: REFUNDED_AT,
        }),
      )

      // The customer got 2,000 back and still owes the 6,000: 8,000 of goods, 2,000 paid.
      expect(await refundedCash(payload.saleId)).toBe(2000)
      expect(await h.debtOf(payload.saleId)).toEqual({
        originalAmount: 6000,
        status: 'OUTSTANDING',
      })
      expect(await h.saleRow(payload.saleId)).toMatchObject({
        amountPaid: 2000,
        creditAmount: 6000,
      })
    })

    it('leaves a debt that was paid in full settled when the sale is voided (R11)', async () => {
      const payload = await sold(4000)
      await dataSource.query(
        `UPDATE debts SET status = 'SETTLED', settled_at = now() WHERE source_id = $1`,
        [payload.saleId],
      )

      await h.sales.void(payload.saleId, h.businessId, h.actor() as never, {
        reason: 'Rang up by mistake at the till',
      })

      expect(await h.debtOf(payload.saleId)).toEqual({ originalAmount: 6000, status: 'SETTLED' })
    })

    it('still writes off an unpaid debt when the sale is voided', async () => {
      const payload = await sold(4000)
      await h.sales.void(payload.saleId, h.businessId, h.actor() as never, {
        reason: 'Rang up by mistake at the till',
      })
      expect(await h.debtOf(payload.saleId)).toEqual({
        originalAmount: 6000,
        status: 'WRITTEN_OFF',
      })
    })
  })
})
