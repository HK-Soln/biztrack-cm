import { beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseService } from '@biztrack/electron-core'
import { createTestDatabase } from '@biztrack/electron-core/testing'
import type { DebtsService } from '../services/debts.service'
import { SalesService } from '../services/sales.service'
import { SavingsService } from '../services/savings.service'

// A checkout is one transaction: when any step fails, nothing of the sale is left behind —
// no sale row, no stock movement, no outbox row for the server.

const BIZ = 'biz-1'
const NOW = '2026-08-28T12:00:00.000Z'

const count = (db: DatabaseService, table: string) =>
  db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)?.n

describe('SalesService.createSale — atomic', () => {
  let db: DatabaseService
  beforeEach(() => {
    db = createTestDatabase()
    db.run(
      `INSERT INTO products (id, business_id, name, price, cost_price, stock_quantity, track_inventory, unit, created_at, updated_at)
       VALUES ('p-1', ?, 'Rice', 1000, 500, 10, 1, 'qty', ?, ?)`,
      [BIZ, NOW, NOW],
    )
    db.run(
      `INSERT INTO contacts (id, business_id, type, name, phone, is_active, created_at, updated_at)
       VALUES ('c-1', ?, 'CUSTOMER', 'Kemi', '+237600000000', 1, ?, ?)`,
      [BIZ, NOW, NOW],
    )
  })

  it('rolls back the whole sale when a late step fails', () => {
    // The receivable is raised after the sale, its lines, the stock movement and the outbox
    // row are written — so a failure here exercises the rollback of all of them.
    const failingDebts = {
      createSourceDebt: () => {
        throw new Error('debt write failed')
      },
    } as unknown as DebtsService
    const service = new SalesService(
      db,
      () => BIZ,
      () => {},
      () => 'u-1',
      () => 'Cashier',
      failingDebts,
      new SavingsService(db, () => BIZ),
    )

    expect(() =>
      service.createSale({
        clientId: 'c-fail',
        soldAt: NOW,
        customerId: 'c-1',
        items: [{ productId: 'p-1', quantity: 2, unitPrice: 1000 }],
        payments: [],
      }),
    ).toThrow('debt write failed')

    expect(count(db, 'sales')).toBe(0)
    expect(count(db, 'sale_items')).toBe(0)
    expect(count(db, 'inventory_movements')).toBe(0)
    expect(count(db, 'sync_outbox')).toBe(0)
    expect(count(db, 'debts')).toBe(0)
    expect(
      db.get<{ v: number }>(`SELECT stock_quantity AS v FROM products WHERE id = 'p-1'`)?.v,
    ).toBe(10)
  })
})
