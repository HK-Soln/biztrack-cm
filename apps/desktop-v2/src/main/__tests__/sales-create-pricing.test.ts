import { beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseService } from '@biztrack/electron-core'
import { createTestDatabase } from '@biztrack/electron-core/testing'
import { DebtsService } from '../services/debts.service'
import { SalesService } from '../services/sales.service'
import { SavingsService } from '../services/savings.service'
import type { SaleInput } from '../../shared/ipc'

// Pins what SalesService.createSale persists for a checkout's money: line pricing (the BIZ-1.2
// OVERRIDE model), the cart-discount allocation (BIZ-1.3) and the sale totals. The pricing
// itself is @biztrack/domain's priceSale — the same function the API runs — so these rows are
// what the server recomputes when the sale syncs.

const BIZ = 'biz-1'
const NOW = '2026-08-28T12:00:00.000Z'
const CASH = 'CASH' as SaleInput['payments'][number]['method']

function makeService(db: DatabaseService): SalesService {
  const debts = new DebtsService(
    db,
    () => BIZ,
    () => {},
    () => 'u-1',
  )
  const savings = new SavingsService(db, () => BIZ)
  return new SalesService(
    db,
    () => BIZ,
    () => {},
    () => 'u-1',
    () => 'Cashier',
    debts,
    savings,
  )
}

function seedProduct(db: DatabaseService, id: string, price: number): void {
  db.run(
    `INSERT INTO products (id, business_id, name, price, cost_price, stock_quantity, track_inventory, unit, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 100, 1, 'qty', ?, ?)`,
    [id, BIZ, id.toUpperCase(), price, price * 0.5, NOW, NOW],
  )
}

type ItemRow = {
  unit_price: number
  unit_price_listed: number
  discount_amount: number
  cart_discount_alloc: number
  line_total: number
}
const itemsOf = (db: DatabaseService, saleId: string) =>
  db.query<ItemRow>(
    `SELECT unit_price, unit_price_listed, discount_amount, cart_discount_alloc, line_total
       FROM sale_items WHERE sale_id = ? ORDER BY line_total`,
    [saleId],
  )
const lineDiscountsOf = (db: DatabaseService, saleId: string) =>
  db.query<{ discount_type: string; amount: number; reason_code: string | null }>(
    `SELECT discount_type, amount, reason_code FROM sale_discounts
      WHERE sale_id = ? AND sale_item_id IS NOT NULL ORDER BY discount_type`,
    [saleId],
  )

describe('SalesService.createSale — pricing and totals', () => {
  let db: DatabaseService
  beforeEach(() => {
    db = createTestDatabase()
    seedProduct(db, 'p-1', 1000)
    seedProduct(db, 'p-2', 3000)
  })

  it('rings a plain line at the charged price', () => {
    const sale = makeService(db).createSale({
      clientId: 'c-plain',
      soldAt: NOW,
      items: [{ productId: 'p-1', quantity: 2, unitPrice: 1000 }],
      payments: [{ method: CASH, amount: 2500 }],
    })
    expect(sale.subtotal).toBe(2000)
    expect(sale.totalAmount).toBe(2000)
    expect(sale.amountPaid).toBe(2500)
    expect(sale.changeGiven).toBe(500)
    expect(sale.creditAmount).toBe(0)
    expect(itemsOf(db, sale.id)).toEqual([
      {
        unit_price: 1000,
        unit_price_listed: 1000,
        discount_amount: 0,
        cart_discount_alloc: 0,
        line_total: 2000,
      },
    ])
    expect(lineDiscountsOf(db, sale.id)).toEqual([])
  })

  it('rungs a bargained line at the listed price and records OVERRIDE + line discount rows', () => {
    const sale = makeService(db).createSale({
      clientId: 'c-override',
      soldAt: NOW,
      items: [
        {
          productId: 'p-1',
          quantity: 2,
          unitPrice: 900,
          unitPriceListed: 1000,
          discountAmount: 100,
        },
      ],
      payments: [{ method: CASH, amount: 1700 }],
    })
    expect(sale.subtotal).toBe(1700)
    expect(sale.totalAmount).toBe(1700)
    expect(itemsOf(db, sale.id)).toEqual([
      {
        unit_price: 1000,
        unit_price_listed: 1000,
        discount_amount: 300,
        cart_discount_alloc: 0,
        line_total: 1700,
      },
    ])
    expect(lineDiscountsOf(db, sale.id)).toEqual([
      { discount_type: 'FIXED_AMOUNT', amount: 100, reason_code: null },
      { discount_type: 'OVERRIDE', amount: 200, reason_code: 'NEGOTIATED' },
    ])
  })

  it('keeps a price above listed as a markup with no discount', () => {
    const sale = makeService(db).createSale({
      clientId: 'c-markup',
      soldAt: NOW,
      items: [{ productId: 'p-1', quantity: 1, unitPrice: 1200, unitPriceListed: 1000 }],
      payments: [{ method: CASH, amount: 1200 }],
    })
    expect(sale.totalAmount).toBe(1200)
    expect(itemsOf(db, sale.id)).toEqual([
      {
        unit_price: 1200,
        unit_price_listed: 1000,
        discount_amount: 0,
        cart_discount_alloc: 0,
        line_total: 1200,
      },
    ])
    expect(lineDiscountsOf(db, sale.id)).toEqual([])
  })

  it('allocates the cart discount across lines and adds charges to the total', () => {
    const sale = makeService(db).createSale({
      clientId: 'c-cart',
      soldAt: NOW,
      items: [
        { productId: 'p-1', quantity: 1, unitPrice: 1000 },
        { productId: 'p-2', quantity: 1, unitPrice: 3000 },
      ],
      discounts: [{ description: 'Remise', discountType: 'FIXED_AMOUNT', amount: 500 }],
      charges: [{ name: 'Transport', rateType: 'FIXED', rateValue: 200, amount: 200 }],
      payments: [{ method: CASH, amount: 3700 }],
    })
    expect(sale.subtotal).toBe(4000)
    expect(sale.discountAmount).toBe(500)
    expect(sale.chargesAmount).toBe(200)
    expect(sale.totalAmount).toBe(3700)
    expect(itemsOf(db, sale.id)).toEqual([
      {
        unit_price: 1000,
        unit_price_listed: 1000,
        discount_amount: 0,
        cart_discount_alloc: 125,
        line_total: 875,
      },
      {
        unit_price: 3000,
        unit_price_listed: 3000,
        discount_amount: 0,
        cart_discount_alloc: 375,
        line_total: 2625,
      },
    ])
  })

  it('caps the cart discount at the subtotal', () => {
    const sale = makeService(db).createSale({
      clientId: 'c-cap',
      soldAt: NOW,
      items: [{ productId: 'p-1', quantity: 1, unitPrice: 1000 }],
      discounts: [{ description: 'Remise', discountType: 'FIXED_AMOUNT', amount: 5000 }],
      payments: [],
    })
    expect(sale.discountAmount).toBe(1000)
    expect(sale.totalAmount).toBe(0)
    expect(sale.creditAmount).toBe(0)
  })

  it('carries the same priced lines in the sync payload', () => {
    const sale = makeService(db).createSale({
      clientId: 'c-sync',
      soldAt: NOW,
      items: [{ productId: 'p-1', quantity: 2, unitPrice: 900, unitPriceListed: 1000 }],
      payments: [{ method: CASH, amount: 1800 }],
    })
    const row = db.get<{ payload: string }>(
      `SELECT payload FROM sync_outbox WHERE entity = 'sales' AND record_id = ?`,
      [sale.id],
    )
    const payload = JSON.parse(row!.payload) as {
      items: Array<{ unitPrice: number; discountAmount: number; quantity: number }>
    }
    expect(payload.items).toEqual([
      expect.objectContaining({ unitPrice: 1000, discountAmount: 200, quantity: 2 }),
    ])
  })
})
