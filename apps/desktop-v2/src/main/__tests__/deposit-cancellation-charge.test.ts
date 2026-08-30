import { beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseService } from '@biztrack/electron-core'
import { createTestDatabase } from '@biztrack/electron-core/testing'
import { SavingsService } from '../services/savings.service'

// SCRUM-46 — a deposit-cancellation charge is kept by the business (booked as other income). On a
// REFUND close the charge reduces the refundable amount, is written as a `charge` transaction (no
// cash leaves the till), and surfaces through getOtherIncome() for the income-statement / P&L.

const BIZ = 'biz-1'

function makeService(db: DatabaseService): SavingsService {
  return new SavingsService(
    db,
    () => BIZ,
    () => {},
    () => 'u-1',
  )
}

function chargeTotal(db: DatabaseService, savingsId: string): number {
  return (
    db.get<{ amt: number }>(
      `SELECT COALESCE(SUM(amount), 0) AS amt FROM savings_transactions WHERE savings_id = ? AND type = 'charge'`,
      [savingsId],
    )?.amt ?? 0
  )
}

function refundTotal(db: DatabaseService, savingsId: string): number {
  return (
    db.get<{ amt: number }>(
      `SELECT COALESCE(SUM(amount), 0) AS amt FROM savings_transactions WHERE savings_id = ? AND type = 'refund'`,
      [savingsId],
    )?.amt ?? 0
  )
}

describe('SavingsService deposit-cancellation charge (SCRUM-46)', () => {
  let db: DatabaseService
  beforeEach(() => {
    db = createTestDatabase()
  })

  it('keeps the charge, refunds only the remainder, and reports it as other income', () => {
    const svc = makeService(db)
    const acc = svc.createSession({ customerId: 'c-1', initialDeposit: { amount: 50000 } })
    const closed = svc.close(acc.id, { settlement: 'REFUND', cancellationCharge: 5000 })

    expect(closed.balance).toBe(0)
    expect(closed.totalRefunded).toBe(45000) // only the refundable part is "refunded"
    expect(chargeTotal(db, acc.id)).toBe(5000)
    expect(refundTotal(db, acc.id)).toBe(45000)
    expect(svc.getOtherIncome().total).toBe(5000)
  })

  it('a charge equal to the balance leaves nothing to refund', () => {
    const svc = makeService(db)
    const acc = svc.createSession({ customerId: 'c-2', initialDeposit: { amount: 8000 } })
    const closed = svc.close(acc.id, {
      settlement: 'REFUND',
      cancellationCharge: 8000,
      refunds: [],
    })

    expect(closed.balance).toBe(0)
    expect(closed.totalRefunded).toBe(0)
    expect(refundTotal(db, acc.id)).toBe(0)
    expect(chargeTotal(db, acc.id)).toBe(8000)
    expect(svc.getOtherIncome().total).toBe(8000)
  })

  it('rejects a charge larger than the balance', () => {
    const svc = makeService(db)
    const acc = svc.createSession({ customerId: 'c-3', initialDeposit: { amount: 10000 } })
    expect(() => svc.close(acc.id, { settlement: 'REFUND', cancellationCharge: 20000 })).toThrow()
  })

  it('a plain refund with no charge books no other income', () => {
    const svc = makeService(db)
    const acc = svc.createSession({ customerId: 'c-4', initialDeposit: { amount: 12000 } })
    const closed = svc.close(acc.id, { settlement: 'REFUND' })

    expect(closed.totalRefunded).toBe(12000)
    expect(chargeTotal(db, acc.id)).toBe(0)
    expect(svc.getOtherIncome().total).toBe(0)
  })

  it('other income is bucketed by trading day range', () => {
    const svc = makeService(db)
    const acc = svc.createSession({ customerId: 'c-5', initialDeposit: { amount: 30000 } })
    svc.close(acc.id, { settlement: 'REFUND', cancellationCharge: 3000 })

    // the charge's business_date is today — an earlier window excludes it
    expect(svc.getOtherIncome({ dateFrom: '2000-01-01', dateTo: '2000-12-31' }).total).toBe(0)
    expect(svc.getOtherIncome({ dateFrom: '2000-01-01' }).total).toBe(3000)
  })
})
