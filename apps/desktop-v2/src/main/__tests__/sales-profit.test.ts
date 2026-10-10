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
    const today = new Date().toISOString().slice(0, 10)
    expect(service.grossProfit({ dateFrom: today, dateTo: today })).toEqual({
      revenue: -850,
      cogs: -500,
    })
  })

  it('leaves a voided sale out entirely', () => {
    service.voidSale(saleId, 'Rung by mistake, customer left')
    expect(service.grossProfit()).toEqual({ revenue: 0, cogs: 0 })
  })
})
