import { beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseService } from '@biztrack/electron-core'
import { createTestDatabase } from '@biztrack/electron-core/testing'
import { SalesService } from '../services/sales.service'

// BIZ-5.1 slice 4: the sales reports bucket by the local trading day (business_date),
// falling back to the UTC sale_date for pre-migration rows. This exercises the real report
// SQL (dailySeries / cashierRoster) against the migrated schema.

const BIZ = 'biz-1'

function makeService(db: DatabaseService): SalesService {
  return new SalesService(
    db,
    () => BIZ,
    () => {},
    () => 'u-1',
    () => 'Cashier',
    {} as never, // debts — unused by the report methods
    {} as never, // savings — unused by the report methods
  )
}

function insertSale(
  db: DatabaseService,
  id: string,
  opts: { saleDate: string; businessDate: string | null; total: number; credit?: number },
): void {
  db.run(
    `INSERT INTO sales
      (id, business_id, client_id, cashier_id, cashier_name, sale_number, receipt_number, subtotal, total_amount,
       discount_amount, charges_amount, tax_amount, net_amount, amount_paid, credit_amount, change_given,
       payment_method, momo_reference, customer_id, customer_name, customer_phone, notes, currency, sale_date,
       sold_at, cash_session_id, business_date, status, is_deleted, created_at, updated_at)
     VALUES (?, ?, ?, 'u-1', 'Cashier', ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, 0, 'CASH', NULL, NULL, NULL, NULL, NULL, 'XAF', ?,
             ?, NULL, ?, 'COMPLETED', 0, ?, ?)`,
    [
      id,
      BIZ,
      id,
      id,
      id,
      opts.total,
      opts.total,
      opts.total,
      opts.total - (opts.credit ?? 0),
      opts.credit ?? 0,
      opts.saleDate,
      `${opts.saleDate}T12:00:00.000Z`,
      opts.businessDate,
      `${opts.saleDate}T12:00:00.000Z`,
      `${opts.saleDate}T12:00:00.000Z`,
    ],
  )
}

describe('SalesService reports — business_date bucketing (BIZ-5.1)', () => {
  let db: DatabaseService
  beforeEach(() => {
    db = createTestDatabase()
  })

  it('dailySeries groups by business_date and falls back to sale_date when unset', () => {
    // Two sales stamped to the 20th (business_date) though rung on the UTC 19th…
    insertSale(db, 's-a', { saleDate: '2026-08-19', businessDate: '2026-08-20', total: 1000 })
    insertSale(db, 's-c', { saleDate: '2026-08-20', businessDate: '2026-08-20', total: 300 })
    // …and one legacy row with no business_date, which falls back to its sale_date (the 19th).
    insertSale(db, 's-b', { saleDate: '2026-08-19', businessDate: null, total: 500 })

    const series = makeService(db).dailySeries({})
    const byDay = Object.fromEntries(series.map((r) => [r.date, r.total]))
    expect(byDay['2026-08-20']).toBe(1300) // s-a + s-c
    expect(byDay['2026-08-19']).toBe(500) // s-b via fallback
  })

  it('honours a business_date range filter', () => {
    insertSale(db, 's-a', { saleDate: '2026-08-19', businessDate: '2026-08-20', total: 1000 })
    insertSale(db, 's-b', { saleDate: '2026-08-19', businessDate: null, total: 500 })

    const series = makeService(db).dailySeries({ dateFrom: '2026-08-20', dateTo: '2026-08-20' })
    expect(series).toHaveLength(1)
    expect(series[0]?.date).toBe('2026-08-20')
    expect(series[0]?.total).toBe(1000)
  })

  it('cashierRoster counts distinct trading days as shifts', () => {
    insertSale(db, 's-a', { saleDate: '2026-08-19', businessDate: '2026-08-20', total: 1000 })
    insertSale(db, 's-c', { saleDate: '2026-08-20', businessDate: '2026-08-20', total: 300 })
    insertSale(db, 's-b', { saleDate: '2026-08-19', businessDate: null, total: 500 })

    const roster = makeService(db).cashierRoster({})
    const row = roster.find((r) => r.cashierId === 'u-1')
    expect(row?.shifts).toBe(2) // business_date 2026-08-20 + fallback 2026-08-19
    expect(row?.transactions).toBe(3)
    expect(row?.sales).toBe(1800)
  })
})
