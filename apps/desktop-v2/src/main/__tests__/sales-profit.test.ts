import { beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseService } from '@biztrack/electron-core'
import { createTestDatabase } from '@biztrack/electron-core/testing'
import { DebtsService } from '../services/debts.service'
import { SalesService } from '../services/sales.service'
import { SavingsService } from '../services/savings.service'
import type { SaleInput } from '../../shared/ipc'

// Ruling R4 — the Income Statement's revenue and cost of goods. A refunded sale still counts
// on the day it was sold; the refund comes off the day of the refund, at the value actually
// charged, and gives back the cost of the items put back into stock. The rule itself is
// @biztrack/domain's, shared with the server.

const BIZ = 'biz-1'
const SOLD_AT = '2026-08-28T12:00:00.000Z'
const CASH = 'CASH' as SaleInput['payments'][number]['method']

function makeService(db: DatabaseService): SalesService {
  const debts = new DebtsService(
    db,
    () => BIZ,
    () => {},
    () => 'u-1',
  )
  return new SalesService(
    db,
    () => BIZ,
    () => {},
    () => 'u-1',
    () => 'Cashier',
    debts,
    new SavingsService(db, () => BIZ),
  )
}

describe('SalesService.grossProfit — refunds (R4)', () => {
  let db: DatabaseService
  let service: SalesService
  let saleId: string
  let itemId: string

  beforeEach(() => {
    db = createTestDatabase()
    db.run(
      `INSERT INTO products (id, business_id, name, price, cost_price, stock_quantity, track_inventory, unit, created_at, updated_at)
       VALUES ('p-1', ?, 'Rice', 1000, 500, 100, 1, 'qty', ?, ?)`,
      [BIZ, SOLD_AT, SOLD_AT],
    )
    service = makeService(db)
    // 2 units listed at 1000, sold for 1700 after a 300 line discount; cost 500 each.
    const sale = service.createSale({
      clientId: 'c-1',
      soldAt: SOLD_AT,
      items: [{ productId: 'p-1', quantity: 2, unitPrice: 1000, discountAmount: 300 }],
      payments: [{ method: CASH, amount: 1700 }],
    })
    saleId = sale.id
    itemId = db.get<{ id: string }>(`SELECT id FROM sale_items WHERE sale_id = ?`, [saleId])!.id
  })

  it('counts a sale with no refund in full', () => {
    expect(service.grossProfit()).toEqual({ revenue: 1700, cogs: 1000 })
  })

  it('a partial refund takes off the charged value and the restocked cost, not the whole sale', () => {
    service.refundSale(saleId, { items: [{ saleItemId: itemId, quantity: 1 }] })
    // Revenue 1700 − 850 (half the discounted line); cost 1000 − 500 (one unit restocked).
    expect(service.grossProfit()).toEqual({ revenue: 850, cogs: 500 })
  })

  it('keeps the cost when the returned goods are not restocked', () => {
    service.refundSale(saleId, { items: [{ saleItemId: itemId, quantity: 1 }], restock: false })
    expect(service.grossProfit()).toEqual({ revenue: 850, cogs: 1000 })
  })

  it('a full refund nets the sale to zero', () => {
    service.refundSale(saleId, {})
    expect(service.grossProfit()).toEqual({ revenue: 0, cogs: 0 })
  })

  it('books the refund on the day of the refund, not the day of the sale', () => {
    service.refundSale(saleId, { items: [{ saleItemId: itemId, quantity: 1 }] })
    // The sale day still shows the sale in full; the refund was recorded today.
    expect(service.grossProfit({ dateFrom: '2026-08-28', dateTo: '2026-08-28' })).toEqual({
      revenue: 1700,
      cogs: 1000,
    })
    // The refund's own trading day (local, with the business's day cutover).
    const refundDay = db.get<{ d: string }>(
      `SELECT business_date AS d FROM sale_returns WHERE sale_id = ?`,
      [saleId],
    )!.d
    expect(service.grossProfit({ dateFrom: refundDay, dateTo: refundDay })).toEqual({
      revenue: -850,
      cogs: -500,
    })
  })

  it('leaves a voided sale out entirely', () => {
    service.voidSale(saleId, 'Rung by mistake, customer left')
    expect(service.grossProfit()).toEqual({ revenue: 0, cogs: 0 })
  })

  it('stamps the refund with the trading day it was made on', () => {
    service.refundSale(saleId, { items: [{ saleItemId: itemId, quantity: 1 }] })
    const row = db.get<{ business_date: string | null }>(
      `SELECT business_date FROM sale_returns WHERE sale_id = ?`,
      [saleId],
    )
    expect(row?.business_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const payload = JSON.parse(
      db.get<{ payload: string }>(
        `SELECT payload FROM sync_outbox WHERE entity = 'sales' AND record_id = ?`,
        [saleId],
      )!.payload,
    ) as { returns: Array<{ createdAt?: string; businessDate?: string }> }
    expect(payload.returns[0]?.businessDate).toBe(row?.business_date)
    expect(payload.returns[0]?.createdAt).toBeTruthy()
  })
})

describe('SalesService — reports net of refunds (R4)', () => {
  let db: DatabaseService
  let service: SalesService
  let saleId: string
  let itemId: string

  beforeEach(() => {
    db = createTestDatabase()
    db.run(
      `INSERT INTO products (id, business_id, name, price, cost_price, stock_quantity, track_inventory, unit, created_at, updated_at)
       VALUES ('p-1', ?, 'Rice', 1000, 500, 100, 1, 'qty', ?, ?)`,
      [BIZ, SOLD_AT, SOLD_AT],
    )
    service = makeService(db)
    const sale = service.createSale({
      clientId: 'c-1',
      soldAt: SOLD_AT,
      items: [{ productId: 'p-1', quantity: 2, unitPrice: 1000, discountAmount: 300 }],
      payments: [{ method: CASH, amount: 1700 }],
    })
    saleId = sale.id
    itemId = db.get<{ id: string }>(`SELECT id FROM sale_items WHERE sale_id = ?`, [saleId])!.id
  })

  it('by product: a partly refunded sale keeps what the customer kept', () => {
    service.refundSale(saleId, { items: [{ saleItemId: itemId, quantity: 1 }] })
    expect(service.byProduct()).toEqual([
      expect.objectContaining({ productId: 'p-1', quantity: 1, revenue: 850, cogs: 500 }),
    ])
  })

  it('by payment method: refunds come off the money collected', () => {
    expect(service.byPaymentMethod()).toEqual([{ method: 'CASH', transactions: 1, amount: 1700 }])
    service.refundSale(saleId, { items: [{ saleItemId: itemId, quantity: 1 }] })
    expect(service.byPaymentMethod()).toEqual([{ method: 'CASH', transactions: 1, amount: 850 }])
  })

  // Ruling R19: the other sales reports net a partly refunded sale the same way.
  const refundOne = () =>
    service.refundSale(saleId, { items: [{ saleItemId: itemId, quantity: 1 }], reason: 'Damaged' })
  const refundDay = () =>
    db.get<{ d: string }>(`SELECT business_date AS d FROM sale_returns WHERE sale_id = ?`, [
      saleId,
    ])!.d

  it('period summary: the sale still counts, less the goods returned', () => {
    refundOne()
    expect(service.summary()).toEqual(
      expect.objectContaining({
        revenue: 850,
        transactions: 1,
        averageBasket: 850,
        itemsSold: 1,
        refundCount: 1,
        refundAmount: 850,
      }),
    )
  })

  it('daily series: the return and the cash handed back come off the day of the refund', () => {
    refundOne()
    const rows = service.dailySeries()
    expect(rows.find((r) => r.date === '2026-08-28')).toEqual(
      expect.objectContaining({ transactions: 1, total: 1700, cash: 1700 }),
    )
    expect(rows.find((r) => r.date === refundDay())).toEqual(
      expect.objectContaining({ transactions: 0, total: -850, cash: -850 }),
    )
  })

  it('cashier roster: the return comes off the selling cashier', () => {
    refundOne()
    expect(service.cashierRoster()).toEqual([
      expect.objectContaining({ cashierId: 'u-1', transactions: 1, sales: 850, refunds: 850 }),
    ])
  })

  it('refunds report: lists the return by its reason and cashier', () => {
    refundOne()
    expect(service.refunds()).toEqual({
      byReason: [{ reason: 'Damaged', count: 1, amount: 850 }],
      byCashier: [expect.objectContaining({ cashierId: 'u-1', refunds: 850, sales: 1700 })],
      grossSales: 1700,
    })
  })

  it('discount reports: the discount still counts, gross sales are net of the return', () => {
    refundOne()
    expect(service.discountSummary()).toEqual(
      expect.objectContaining({ totalDiscount: 300, grossSales: 850, saleCount: 1 }),
    )
    expect(service.discountsByProduct()).toEqual([
      expect.objectContaining({ productId: 'p-1', discountTotal: 300, revenue: 850, cogs: 500 }),
    ])
  })
})

describe('SalesService.voidSale — after refunds', () => {
  let db: DatabaseService
  let service: SalesService
  let saleId: string
  let itemId: string
  const stock = () =>
    db.get<{ v: number }>(`SELECT stock_quantity AS v FROM products WHERE id = 'p-1'`)?.v

  beforeEach(() => {
    db = createTestDatabase()
    db.run(
      `INSERT INTO products (id, business_id, name, price, cost_price, stock_quantity, track_inventory, unit, created_at, updated_at)
       VALUES ('p-1', ?, 'Rice', 1000, 500, 100, 1, 'qty', ?, ?)`,
      [BIZ, SOLD_AT, SOLD_AT],
    )
    service = makeService(db)
    const sale = service.createSale({
      clientId: 'c-1',
      soldAt: SOLD_AT,
      items: [{ productId: 'p-1', quantity: 2, unitPrice: 1000 }],
      payments: [{ method: CASH, amount: 2000 }],
    })
    saleId = sale.id
    itemId = db.get<{ id: string }>(`SELECT id FROM sale_items WHERE sale_id = ?`, [saleId])!.id
  })

  it('voids only the balance of a partly refunded sale', () => {
    service.refundSale(saleId, { items: [{ saleItemId: itemId, quantity: 1 }] })
    expect(stock()).toBe(99)

    const voided = service.voidSale(saleId, 'Customer cancelled the rest')
    expect(voided.status).toBe('VOIDED')
    // Only the one unit still sold comes back: 99 + 1, not 99 + 2.
    expect(stock()).toBe(100)
  })

  it('refuses to void a fully refunded sale', () => {
    service.refundSale(saleId, {})
    expect(() => service.voidSale(saleId, 'Trying to void a refunded sale')).toThrow(
      'is fully refunded and cannot be voided',
    )
    expect(stock()).toBe(100)
  })
})
