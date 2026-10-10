import { beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseService } from '@biztrack/electron-core'
import { createTestDatabase } from '@biztrack/electron-core/testing'
import { DebtsService } from '../services/debts.service'
import { SalesService } from '../services/sales.service'
import { SavingsService } from '../services/savings.service'
import type { SaleInput } from '../../shared/ipc'

// Pins how SalesService settles a checkout and a return. The settlement itself is
// @biztrack/domain's (settleSale, storedPaymentMethod, decideSaleRefund) — the same functions
// the API runs — so the paid / credit / change / method stored here match what the server
// records when the sale syncs.

const BIZ = 'biz-1'
const NOW = '2026-08-28T12:00:00.000Z'
type Method = SaleInput['payments'][number]['method']
const CASH = 'CASH' as Method
const MOMO = 'MTN_MOMO' as Method

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

const storedMethod = (db: DatabaseService, saleId: string) =>
  db.get<{ v: string | null }>(`SELECT payment_method AS v FROM sales WHERE id = ?`, [saleId])?.v

describe('SalesService — settlement', () => {
  let db: DatabaseService
  beforeEach(() => {
    db = createTestDatabase()
    db.run(
      `INSERT INTO products (id, business_id, name, price, cost_price, stock_quantity, track_inventory, unit, created_at, updated_at)
       VALUES ('p-1', ?, 'Rice', 1000, 500, 100, 1, 'kg', ?, ?)`,
      [BIZ, NOW, NOW],
    )
    db.run(
      `INSERT INTO contacts (id, business_id, type, name, phone, is_active, created_at, updated_at)
       VALUES ('c-1', ?, 'CUSTOMER', 'Kemi', '+237600000000', 1, ?, ?)`,
      [BIZ, NOW, NOW],
    )
  })

  it('a sale with no payment is fully on credit: zero change, stored method MIXED', () => {
    const sale = makeService(db).createSale({
      clientId: 'c-credit',
      soldAt: NOW,
      customerId: 'c-1',
      items: [{ productId: 'p-1', quantity: 2, unitPrice: 1000 }],
      payments: [],
    })
    expect(sale.amountPaid).toBe(0)
    expect(sale.creditAmount).toBe(2000)
    expect(sale.changeGiven).toBe(0)
    expect(storedMethod(db, sale.id)).toBe('MIXED')
  })

  it('a part-paid sale leaves the balance as credit with no change', () => {
    const sale = makeService(db).createSale({
      clientId: 'c-part',
      soldAt: NOW,
      customerId: 'c-1',
      items: [{ productId: 'p-1', quantity: 2, unitPrice: 1000 }],
      payments: [{ method: CASH, amount: 500 }],
    })
    expect(sale.amountPaid).toBe(500)
    expect(sale.creditAmount).toBe(1500)
    expect(sale.changeGiven).toBe(0)
    expect(storedMethod(db, sale.id)).toBe('CASH')
  })

  it('rejects a credit sale with no customer', () => {
    expect(() =>
      makeService(db).createSale({
        clientId: 'c-nocust',
        soldAt: NOW,
        items: [{ productId: 'p-1', quantity: 1, unitPrice: 1000 }],
        payments: [],
      }),
    ).toThrow('Credit sales must be linked to a registered customer.')
  })

  it('stores the method when two payment lines share it, MIXED when they differ', () => {
    const service = makeService(db)
    const sameMethod = service.createSale({
      clientId: 'c-same',
      soldAt: NOW,
      items: [{ productId: 'p-1', quantity: 2, unitPrice: 1000 }],
      payments: [
        { method: CASH, amount: 1500 },
        { method: CASH, amount: 500 },
      ],
    })
    expect(storedMethod(db, sameMethod.id)).toBe('CASH')

    const split = service.createSale({
      clientId: 'c-split',
      soldAt: NOW,
      items: [{ productId: 'p-1', quantity: 2, unitPrice: 1000 }],
      payments: [
        { method: CASH, amount: 1500 },
        { method: MOMO, amount: 500 },
      ],
    })
    expect(storedMethod(db, split.id)).toBe('MIXED')
  })

  it('returns part of a weighed line: 0.5 of 2 kg refunds a quarter of the line', () => {
    const service = makeService(db)
    const sale = service.createSale({
      clientId: 'c-weighed',
      soldAt: NOW,
      items: [{ productId: 'p-1', quantity: 2, unitPrice: 1000 }],
      payments: [{ method: CASH, amount: 2000 }],
    })
    const item = db.get<{ id: string }>(`SELECT id FROM sale_items WHERE sale_id = ?`, [sale.id])!

    const refunded = service.refundSale(sale.id, {
      items: [{ saleItemId: item.id, quantity: 0.5 }],
    })

    expect(refunded.status).toBe('PARTIALLY_REFUNDED')
    expect(
      db.get<{ q: number }>(`SELECT quantity AS q FROM sale_return_items WHERE sale_item_id = ?`, [
        item.id,
      ])?.q,
    ).toBe(0.5)
    expect(
      db.get<{ v: number }>(`SELECT refund_amount AS v FROM sale_returns WHERE sale_id = ?`, [
        sale.id,
      ])?.v,
    ).toBe(500)
    expect(refunded.amountPaid).toBe(1500)
    // Restock: 100 − 2 sold + 0.5 returned.
    expect(
      db.get<{ v: number }>(`SELECT stock_quantity AS v FROM products WHERE id = 'p-1'`)?.v,
    ).toBe(98.5)
  })

  it('a second partial return that brings back the rest completes the sale (R5)', () => {
    const service = makeService(db)
    const sale = service.createSale({
      clientId: 'c-two-returns',
      soldAt: NOW,
      items: [{ productId: 'p-1', quantity: 2, unitPrice: 1000 }],
      payments: [{ method: CASH, amount: 2000 }],
    })
    const item = db.get<{ id: string }>(`SELECT id FROM sale_items WHERE sale_id = ?`, [sale.id])!

    const first = service.refundSale(sale.id, { items: [{ saleItemId: item.id, quantity: 1 }] })
    expect(first.status).toBe('PARTIALLY_REFUNDED')

    // Asking for 2 again only returns the 1 that is left.
    const second = service.refundSale(sale.id, { items: [{ saleItemId: item.id, quantity: 2 }] })
    expect(second.status).toBe('REFUNDED')
    expect(
      db.get<{ q: number }>(
        `SELECT SUM(quantity) AS q FROM sale_return_items WHERE sale_item_id = ?`,
        [item.id],
      )?.q,
    ).toBe(2)
    expect(second.amountPaid).toBe(0)
    expect(
      db.get<{ v: number }>(`SELECT stock_quantity AS v FROM products WHERE id = 'p-1'`)?.v,
    ).toBe(100)

    expect(() => service.refundSale(sale.id, {})).toThrow('Select at least one item to return.')
  })
})
