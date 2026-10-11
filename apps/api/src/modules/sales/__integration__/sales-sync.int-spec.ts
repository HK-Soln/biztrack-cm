import type { DataSource } from 'typeorm'
import { ReviewFlagCode, ReviewFlagSeverity, SaleStatus } from '@biztrack/types'
import {
  closeIntegrationDataSource,
  getIntegrationDataSource,
} from '@/testing/integration-database'
import { createSalesSyncHarness, type SalesSyncHarness } from '@/testing/sales-sync-harness'

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
})
