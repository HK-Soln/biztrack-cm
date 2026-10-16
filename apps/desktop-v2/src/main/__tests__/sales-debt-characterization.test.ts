import { beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseService } from '@biztrack/electron-core'
import { createTestDatabase } from '@biztrack/electron-core/testing'
import { DebtsService } from '../services/debts.service'
import { SalesService } from '../services/sales.service'
import { SavingsService } from '../services/savings.service'
import type { SaleInput } from '../../shared/ipc'

// What the till does to a sale's receivable on each path. Written before the SQLite debt
// triggers are replaced (slice 6): whatever replaces them has to keep these passing. What a
// partial return does to the receivable is not pinned here; it is waiting for a ruling
// (docs/design/domain-package.md, "Debts: open questions").

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

const debtsOf = (db: DatabaseService, saleId: string) =>
  db.query<{
    original_amount: number
    status: string
    contact_id: string
    direction: string
    due_date: string | null
    written_off_reason: string | null
  }>(
    `SELECT original_amount, status, contact_id, direction, due_date, written_off_reason
       FROM debts WHERE source_type = 'SALE' AND source_id = ?`,
    [saleId],
  )

describe('a sale and its receivable on the till', () => {
  let db: DatabaseService
  let service: SalesService
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
    service = makeService(db)
  })

  let n = 0
  const sell = (paid: number, over: Partial<SaleInput> = {}) =>
    service.createSale({
      clientId: `client-${++n}`,
      soldAt: NOW,
      customerId: 'c-1',
      items: [{ productId: 'p-1', quantity: 10, unitPrice: 1000 }],
      payments: paid > 0 ? [{ method: CASH, amount: paid }] : [],
      ...over,
    })

  it('a part-paid sale leaves one receivable for the balance', () => {
    const sale = sell(4000)
    expect(debtsOf(db, sale.id)).toEqual([
      {
        original_amount: 6000,
        status: 'OUTSTANDING',
        contact_id: 'c-1',
        direction: 'RECEIVABLE',
        due_date: null,
        written_off_reason: null,
      },
    ])
  })

  it('carries the due date chosen at checkout', () => {
    const sale = sell(4000, { creditDueDate: '2026-09-30' } as Partial<SaleInput>)
    expect(debtsOf(db, sale.id)).toMatchObject([{ original_amount: 6000, due_date: '2026-09-30' }])
  })

  it('a fully paid sale has no receivable', () => {
    expect(debtsOf(db, sell(10000).id)).toEqual([])
  })

  it('voiding a credit sale writes its receivable off, with the reason', () => {
    const sale = sell(4000)
    service.voidSale(sale.id, 'Rang up by mistake at the till')
    expect(debtsOf(db, sale.id)).toMatchObject([
      { original_amount: 6000, status: 'WRITTEN_OFF', written_off_reason: expect.any(String) },
    ])
  })

  it('returning everything on a credit sale writes its receivable off', () => {
    const sale = sell(4000)
    const detail = service.get(sale.id)!
    service.refundSale(sale.id, {
      items: [{ saleItemId: detail.items[0]!.id, quantity: 10 }],
      restock: true,
    } as never)
    expect(debtsOf(db, sale.id)).toMatchObject([{ status: 'WRITTEN_OFF' }])
  })
})
