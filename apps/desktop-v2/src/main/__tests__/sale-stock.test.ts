import { beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseService } from '@biztrack/electron-core'
import { createTestDatabase } from '@biztrack/electron-core/testing'
import { DebtsService } from '../services/debts.service'
import { SalesService } from '../services/sales.service'
import { SavingsService } from '../services/savings.service'
import type { SaleInput } from '../../shared/ipc'

// Slice 9: the stock a sale takes and a void gives back follows @biztrack/domain
// saleStockLines, as on the server: a bundle moves its components, a serialized product's
// units carry its stock and its own quantity is left alone.

const BIZ = 'biz-1'
const NOW = '2026-10-16T12:00:00.000Z'
const CASH = 'CASH' as SaleInput['payments'][number]['method']

describe('stock moved by a sale on the till', () => {
  let db: DatabaseService
  let sales: SalesService
  let n = 0

  const product = (id: string, extra: string, values: unknown[]) =>
    db.run(
      `INSERT INTO products (id, business_id, name, price, unit, created_at, updated_at${extra})
       VALUES (?, ?, ?, 1000, 'qty', ?, ?${values.map(() => ', ?').join('')})`,
      [id, BIZ, id, NOW, NOW, ...values],
    )
  const stock = (id: string) =>
    db.get<{ q: number }>(`SELECT stock_quantity AS q FROM products WHERE id = ?`, [id])!.q

  beforeEach(() => {
    db = createTestDatabase()
    product('rice', ', stock_quantity, track_inventory', [10, 1])
    product('oil', ', stock_quantity, track_inventory', [4, 1])
    product('basket', ', product_type, track_inventory', ['COMPOSITE', 0])
    for (const [component, quantity] of [
      ['rice', 2],
      ['oil', 1],
    ] as const) {
      db.run(
        `INSERT INTO product_bundle_components (id, business_id, bundle_product_id, component_product_id, quantity, is_deleted, created_at, updated_at)
         VALUES (?, ?, 'basket', ?, ?, 0, ?, ?)`,
        [`bc-${component}`, BIZ, component, quantity, NOW, NOW],
      )
    }
    product('phone', ', stock_quantity, track_inventory, is_serialized, serial_type', [
      0,
      1,
      1,
      'SERIAL_NUMBER',
    ])
    db.run(
      `INSERT INTO product_serial_units (id, business_id, product_id, serial_number, serial_type, status, is_deleted, created_at, updated_at)
       VALUES ('su-1', ?, 'phone', 'SN-1', 'SERIAL_NUMBER', 'IN_STOCK', 0, ?, ?)`,
      [BIZ, NOW, NOW],
    )
    const debts = new DebtsService(
      db,
      () => BIZ,
      () => {},
      () => 'u-1',
    )
    sales = new SalesService(
      db,
      () => BIZ,
      () => {},
      () => 'u-1',
      () => 'Cashier',
      debts,
      new SavingsService(db, () => BIZ),
    )
  })

  const sell = (items: SaleInput['items'], total: number) =>
    sales.createSale({
      clientId: `client-${++n}`,
      soldAt: NOW,
      items,
      payments: [{ method: CASH, amount: total }],
    })

  it('takes a bundle from its components, and a void gives it back', () => {
    const sale = sell([{ productId: 'basket', quantity: 2, unitPrice: 1000 }], 2000)
    expect([stock('rice'), stock('oil')]).toEqual([6, 2])

    sales.voidSale(sale.id, 'Rang up by mistake at the till')
    expect([stock('rice'), stock('oil')]).toEqual([10, 4])
  })

  it("moves a serialized product's units, not its own quantity", () => {
    const sale = sell(
      [{ productId: 'phone', quantity: 1, unitPrice: 1000, serialUnitIds: ['su-1'] }],
      1000,
    )
    expect(stock('phone')).toBe(0)

    sales.voidSale(sale.id, 'Rang up by mistake at the till')
    expect(stock('phone')).toBe(0)
    expect(
      db.get<{ s: string }>(`SELECT status AS s FROM product_serial_units WHERE id = 'su-1'`)!.s,
    ).toBe('IN_STOCK')
    // The movements read the unit count: −1 on the sale, back to 1 on the void.
    expect(
      db.query<{ change: number; after: number }>(
        `SELECT quantity_change AS change, quantity_after AS after FROM inventory_movements
         WHERE product_id = 'phone' ORDER BY created_at, type DESC`,
      ),
    ).toEqual([
      { change: -1, after: 0 },
      { change: 1, after: 1 },
    ])
  })
})
