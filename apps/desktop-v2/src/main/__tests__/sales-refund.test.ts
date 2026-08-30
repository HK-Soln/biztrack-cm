import { beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseService } from '@biztrack/electron-core'
import { createTestDatabase } from '@biztrack/electron-core/testing'
import { SalesService } from '../services/sales.service'

// BIZ-1.8 — offline-first refund/return (SalesService.refundSale), mirroring voidSale: it records
// the return + REFUND payment locally, restocks, nets settlement, flips the sale status, and
// re-enqueues the sale (with the return embedded) so the API applies its own return on sync.

const BIZ = 'biz-1'
const NOW = '2026-08-28T12:00:00.000Z'

function makeService(db: DatabaseService): SalesService {
  return new SalesService(
    db,
    () => BIZ,
    () => {},
    () => 'u-1',
    () => 'Cashier',
    {} as never,
    {} as never,
  )
}

function seedSale(db: DatabaseService): void {
  db.run(
    `INSERT INTO products (id, business_id, name, price, stock_quantity, track_inventory, unit, created_at, updated_at)
     VALUES ('p-1', ?, 'Rice', 2000, 10, 1, 'qty', ?, ?)`,
    [BIZ, NOW, NOW],
  )
  db.run(
    `INSERT INTO sales
      (id, business_id, client_id, cashier_id, cashier_name, sale_number, receipt_number, subtotal, total_amount,
       discount_amount, charges_amount, tax_amount, net_amount, amount_paid, credit_amount, change_given,
       payment_method, currency, sale_date, sold_at, business_date, status, is_deleted, created_at, updated_at)
     VALUES ('sale-1', ?, 'sale-1', 'u-1', 'Cashier', 'VTE-1', 'VTE-1', 4000, 4000, 0, 0, 0, 4000, 4000, 0, 0,
             'CASH', 'XAF', '2026-08-28', ?, '2026-08-28', 'COMPLETED', 0, ?, ?)`,
    [BIZ, NOW, NOW, NOW],
  )
  db.run(
    `INSERT INTO sale_items (id, sale_id, business_id, product_id, product_name, quantity, unit_price, discount_amount, line_total, total_price, cost_price, is_deleted, created_at, updated_at)
     VALUES ('si-1', 'sale-1', ?, 'p-1', 'Rice', 2, 2000, 0, 4000, 4000, 1000, 0, ?, ?)`,
    [BIZ, NOW, NOW],
  )
  db.run(
    `INSERT INTO sale_payments (id, sale_id, business_id, method, amount, kind, created_at)
     VALUES ('pay-1', 'sale-1', ?, 'CASH', 4000, 'PAYMENT', ?)`,
    [BIZ, NOW],
  )
}

describe('SalesService.refundSale (BIZ-1.8, offline-first)', () => {
  let db: DatabaseService
  beforeEach(() => {
    db = createTestDatabase()
  })

  it('partial refund: records the return + REFUND payment, restocks, nets settlement, sets PARTIALLY_REFUNDED', () => {
    seedSale(db)
    const detail = makeService(db).refundSale('sale-1', {
      items: [{ saleItemId: 'si-1', quantity: 1 }],
    })

    expect(detail.status).toBe('PARTIALLY_REFUNDED')

    const ret = db.get<{ n: number; refund: number }>(
      `SELECT COUNT(*) AS n, COALESCE(SUM(refund_amount), 0) AS refund FROM sale_returns WHERE sale_id = 'sale-1'`,
    )
    expect(ret?.n).toBe(1)
    expect(ret?.refund).toBe(2000) // 1 of 2 units at 2000

    expect(db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM sale_return_items`)?.n).toBe(1)

    const refPay = db.get<{ n: number; amt: number }>(
      `SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS amt FROM sale_payments WHERE sale_id = 'sale-1' AND kind = 'REFUND'`,
    )
    expect(refPay?.n).toBe(1)
    expect(refPay?.amt).toBe(2000)

    // Settlement nets the refund: 4000 paid − 2000 refunded = 2000.
    expect(db.get<{ v: number }>(`SELECT amount_paid AS v FROM sales WHERE id = 'sale-1'`)?.v).toBe(
      2000,
    )
    // Restock: 10 → 11.
    expect(
      db.get<{ v: number }>(`SELECT stock_quantity AS v FROM products WHERE id = 'p-1'`)?.v,
    ).toBe(11)

    // The sale is re-enqueued with the return embedded for the API to apply.
    const ob = db.get<{ payload: string }>(
      `SELECT payload FROM sync_outbox WHERE entity = 'sales' AND record_id = 'sale-1'`,
    )
    const parsed = JSON.parse(ob!.payload) as {
      status: string
      returns?: Array<{ refundAmount: number; items: Array<{ saleItemId: string }> }>
    }
    expect(parsed.status).toBe('PARTIALLY_REFUNDED')
    expect(parsed.returns?.[0]?.refundAmount).toBe(2000)
    expect(parsed.returns?.[0]?.items?.[0]?.saleItemId).toBe('si-1')
  })

  it('full refund sets REFUNDED and restocks every unit', () => {
    seedSale(db)
    const detail = makeService(db).refundSale('sale-1', {})
    expect(detail.status).toBe('REFUNDED')
    expect(
      db.get<{ v: number }>(`SELECT stock_quantity AS v FROM products WHERE id = 'p-1'`)?.v,
    ).toBe(12)
  })
})
