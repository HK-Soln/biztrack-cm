import { beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseService } from '@biztrack/electron-core'
import { createTestDatabase } from '@biztrack/electron-core/testing'
import { DebtsService } from '../services/debts.service'
import { SalesService } from '../services/sales.service'
import { SavingsService } from '../services/savings.service'
import type { SaleInput } from '../../shared/ipc'

// Ruling R2 on the till: a sale remembers which role and which version of its discount
// limits it was checked against, and sends both with the sale, so the server can tell a
// till that still had old limits from a discount that went over the limit. Whether the
// discount needs a manager is @biztrack/domain's `discountNeedsAuthorization`.

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

function seedCashierRole(db: DatabaseService, limitsVersion: number | null): void {
  db.run(
    `INSERT INTO roles
       (id, business_id, name, is_system, is_owner_role, can_authorize, max_cart_discount_percent,
        allow_below_cost, limits_version, is_deleted, created_at, updated_at)
     VALUES ('r-cashier', ?, 'Cashier', 0, 0, 0, 10, 0, ?, 0, ?, ?)`,
    [BIZ, limitsVersion, NOW, NOW],
  )
  db.run(
    `INSERT INTO business_members
       (id, business_id, user_id, role, role_id, status, name, is_deleted, created_at, updated_at)
     VALUES ('m-1', ?, 'u-1', 'CASHIER', 'r-cashier', 'ACTIVE', 'Cashier', 0, ?, ?)`,
    [BIZ, NOW, NOW],
  )
}

// 2,000 off a 10,000 sale: 20%, against a 10% limit.
const sale = (over: Partial<SaleInput> = {}): SaleInput => ({
  clientId: 'c-1',
  soldAt: NOW,
  items: [{ productId: 'p-1', quantity: 1, unitPrice: 10000 }],
  discounts: [{ description: 'Remise', discountType: 'FIXED_AMOUNT', amount: 2000 }],
  payments: [{ method: CASH, amount: 8000 }],
  ...over,
})

const saleRow = (db: DatabaseService, id: string) =>
  db.get<{ discount_role_id: string | null; discount_limits_version: number | null }>(
    `SELECT discount_role_id, discount_limits_version FROM sales WHERE id = ?`,
    [id],
  )
const discountRows = (db: DatabaseService, id: string) =>
  db.query<{ unauthorized: number; authorized_by: string | null }>(
    `SELECT unauthorized, authorized_by FROM sale_discounts WHERE sale_id = ?`,
    [id],
  )
const payloads = (db: DatabaseService, id: string) =>
  db
    .query<{
      payload: string
    }>(`SELECT payload FROM sync_outbox WHERE entity = 'sales' AND record_id = ? ORDER BY rowid`, [
      id,
    ])
    .map(
      (row) =>
        JSON.parse(row.payload) as {
          discountPolicy?: { roleId: string | null; limitsVersion: number | null }
          discounts: Array<{ unauthorized?: boolean; authorizedBy?: string | null }>
        },
    )

describe('SalesService — discount limits version (R2)', () => {
  let db: DatabaseService
  beforeEach(() => {
    db = createTestDatabase()
    db.run(
      `INSERT INTO products (id, business_id, name, price, cost_price, stock_quantity, track_inventory, unit, created_at, updated_at)
       VALUES ('p-1', ?, 'Phone', 10000, 5000, 100, 1, 'pc', ?, ?)`,
      [BIZ, NOW, NOW],
    )
  })

  it('stores and sends the role and limits version an over-limit sale was checked against', () => {
    seedCashierRole(db, 3)
    const created = makeService(db).createSale(sale())

    expect(saleRow(db, created.id)).toEqual({
      discount_role_id: 'r-cashier',
      discount_limits_version: 3,
    })
    expect(discountRows(db, created.id)).toEqual([{ unauthorized: 1, authorized_by: null }])
    const [payload] = payloads(db, created.id)
    expect(payload!.discountPolicy).toEqual({ roleId: 'r-cashier', limitsVersion: 3 })
    expect(payload!.discounts).toMatchObject([{ unauthorized: true, authorizedBy: null }])
  })

  it('records a manager approval instead of marking the discount unauthorized', () => {
    seedCashierRole(db, 3)
    const created = makeService(db).createSale(sale({ authorizedByUserId: 'u-manager' }))
    expect(discountRows(db, created.id)).toEqual([{ unauthorized: 0, authorized_by: 'u-manager' }])
  })

  it('sends no version for a role pulled before versions existed, and none without a role', () => {
    seedCashierRole(db, null)
    const withRole = makeService(db).createSale(sale())
    expect(payloads(db, withRole.id)[0]!.discountPolicy).toEqual({
      roleId: 'r-cashier',
      limitsVersion: null,
    })

    db.run(`UPDATE business_members SET role_id = NULL WHERE id = 'm-1'`)
    const noRole = makeService(db).createSale(sale({ clientId: 'c-2' }))
    expect(payloads(db, noRole.id)[0]!.discountPolicy).toEqual({
      roleId: null,
      limitsVersion: null,
    })
    // No role, no limit: the discount needs nobody.
    expect(discountRows(db, noRole.id)).toEqual([{ unauthorized: 0, authorized_by: null }])
  })

  it('sends the same verdict and version when the sale is pushed again for a refund', () => {
    seedCashierRole(db, 3)
    const service = makeService(db)
    const created = service.createSale(sale())
    // The role moves on after the sale; the sale keeps what it was checked against.
    db.run(`UPDATE roles SET limits_version = 4, max_cart_discount_percent = 50`)
    const detail = service.get(created.id)!
    service.refundSale(created.id, {
      items: [{ saleItemId: detail.items[0]!.id, quantity: 1 }],
      restock: true,
    } as never)

    const pushed = payloads(db, created.id)
    // The outbox keeps one row per sale: the refund replaces the pending payload, so this
    // is what reaches the server for a sale refunded before its first sync.
    const last = pushed.at(-1)!
    expect(last.discountPolicy).toEqual({ roleId: 'r-cashier', limitsVersion: 3 })
    expect(last.discounts).toMatchObject([{ unauthorized: true, authorizedBy: null }])
  })
})
