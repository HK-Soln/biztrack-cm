import { beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseService } from '@biztrack/electron-core'
import { createTestDatabase } from '@biztrack/electron-core/testing'
import { DebtsService } from '../services/debts.service'

// Netting what a contact owes against what is owed to them, on the till. The plan is
// @biztrack/domain's `planDebtOffset`; the payment check is `checkDebtPayment`.

const BIZ = 'biz-1'
const NOW = '2026-08-28T12:00:00.000Z'

describe('debts on the till', () => {
  let db: DatabaseService
  let debts: DebtsService

  beforeEach(() => {
    db = createTestDatabase()
    db.run(
      `INSERT INTO contacts (id, business_id, type, name, phone, is_active, created_at, updated_at)
       VALUES ('c-1', ?, 'BOTH', 'Kemi', '+237600000000', 1, ?, ?)`,
      [BIZ, NOW, NOW],
    )
    debts = new DebtsService(
      db,
      () => BIZ,
      () => {},
      () => 'u-1',
    )
  })

  const debt = (id: string, direction: 'RECEIVABLE' | 'PAYABLE', amount: number, at: string) =>
    db.run(
      `INSERT INTO debts (id, business_id, contact_id, direction, source_type, source_id, source_reference, original_amount, status, created_at)
       VALUES (?, ?, 'c-1', ?, 'OPENING_BALANCE', ?, ?, ?, 'OUTSTANDING', ?)`,
      [id, BIZ, direction, id, id, amount, at],
    )
  const standing = (id: string) =>
    db.get<{ status: string; paid: number }>(
      `SELECT d.status, COALESCE((SELECT SUM(amount) FROM debt_payments WHERE debt_id = d.id), 0) AS paid
         FROM debts d WHERE d.id = ?`,
      [id],
    )

  it('nets the smaller side off both, oldest debt first', () => {
    debt('r-old', 'RECEIVABLE', 3000, '2026-01-01T00:00:00.000Z')
    debt('r-new', 'RECEIVABLE', 5000, '2026-02-01T00:00:00.000Z')
    debt('p-1', 'PAYABLE', 4000, '2026-01-15T00:00:00.000Z')

    expect(debts.offset('c-1')).toEqual({ offsetAmount: 4000, affected: 3 })
    expect(standing('r-old')).toEqual({ status: 'SETTLED', paid: 3000 })
    expect(standing('r-new')).toEqual({ status: 'PARTIALLY_PAID', paid: 1000 })
    expect(standing('p-1')).toEqual({ status: 'SETTLED', paid: 4000 })
  })

  it('refuses when one side has nothing open', () => {
    debt('r-1', 'RECEIVABLE', 3000, NOW)
    expect(() => debts.offset('c-1')).toThrow('Nothing to offset')
  })

  it('takes a payment up to what is owed, and no more', () => {
    debt('r-1', 'RECEIVABLE', 3000, NOW)
    const pay = (amount: number) =>
      debts.recordPayment('r-1', { amount, method: 'CASH', paymentDate: NOW } as never)
    expect(() => pay(3001)).toThrow('exceeds the outstanding balance')
    expect(() => pay(0)).toThrow('greater than 0')
    pay(3000)
    expect(standing('r-1')).toEqual({ status: 'SETTLED', paid: 3000 })
  })
})
