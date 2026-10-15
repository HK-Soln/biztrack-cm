import { describe, expect, it } from 'vitest'
import { DebtStatus } from '@biztrack/types'
import {
  checkDebtPayment,
  debtCanBeWrittenOff,
  debtSettledAt,
  debtStanding,
  planDebtOffset,
  reduceDebt,
} from './debt-status'

describe('debtStanding', () => {
  it('is outstanding with nothing paid', () => {
    expect(debtStanding({ originalAmount: 10000, paidAmount: 0 })).toEqual({
      status: DebtStatus.OUTSTANDING,
      paidAmount: 0,
      outstandingAmount: 10000,
      settled: false,
    })
  })

  it('is partially paid once something is paid', () => {
    expect(debtStanding({ originalAmount: 10000, paidAmount: 4000 })).toMatchObject({
      status: DebtStatus.PARTIALLY_PAID,
      outstandingAmount: 6000,
    })
  })

  it('is settled when paid in full or overpaid, and never owes a negative amount', () => {
    expect(debtStanding({ originalAmount: 10000, paidAmount: 10000 })).toMatchObject({
      status: DebtStatus.SETTLED,
      outstandingAmount: 0,
      settled: true,
    })
    expect(debtStanding({ originalAmount: 10000, paidAmount: 12000 })).toMatchObject({
      status: DebtStatus.SETTLED,
      outstandingAmount: 0,
    })
  })

  it('works in whole francs, so float drift in the payments does not leave a debt open', () => {
    expect(debtStanding({ originalAmount: 10000, paidAmount: 9999.999999 }).status).toBe(
      DebtStatus.SETTLED,
    )
    expect(debtStanding({ originalAmount: 10000, paidAmount: 9999 }).status).toBe(
      DebtStatus.PARTIALLY_PAID,
    )
  })

  it('keeps a written-off debt written off, whatever is paid', () => {
    expect(
      debtStanding({ originalAmount: 10000, paidAmount: 10000, writtenOff: true }),
    ).toMatchObject({ status: DebtStatus.WRITTEN_OFF, outstandingAmount: 0 })
    expect(debtStanding({ originalAmount: 10000, paidAmount: 0, writtenOff: true }).status).toBe(
      DebtStatus.WRITTEN_OFF,
    )
  })

  it('treats a debt of nothing as settled', () => {
    expect(debtStanding({ originalAmount: 0, paidAmount: 0 }).status).toBe(DebtStatus.SETTLED)
  })
})

describe('debtSettledAt', () => {
  const settled = { status: DebtStatus.SETTLED }
  it('keeps the first settlement date and sets one when there is none', () => {
    expect(debtSettledAt(settled, '2026-01-01', '2026-02-02')).toBe('2026-01-01')
    expect(debtSettledAt(settled, null, '2026-02-02')).toBe('2026-02-02')
  })
  it('has none for a debt that is not settled', () => {
    expect(debtSettledAt({ status: DebtStatus.PARTIALLY_PAID }, '2026-01-01', '2026-02-02')).toBe(
      null,
    )
    expect(debtSettledAt({ status: DebtStatus.WRITTEN_OFF }, '2026-01-01', '2026-02-02')).toBe(null)
  })
})

describe('debtCanBeWrittenOff (R11)', () => {
  it('leaves a settled debt settled and a written-off debt alone', () => {
    expect(debtCanBeWrittenOff(DebtStatus.OUTSTANDING)).toBe(true)
    expect(debtCanBeWrittenOff(DebtStatus.PARTIALLY_PAID)).toBe(true)
    expect(debtCanBeWrittenOff(DebtStatus.SETTLED)).toBe(false)
    expect(debtCanBeWrittenOff(DebtStatus.WRITTEN_OFF)).toBe(false)
  })
})

describe('reduceDebt (R10)', () => {
  it('takes the returned goods off what is owed for', () => {
    expect(reduceDebt({ originalAmount: 6000, paidAmount: 0, reduction: 2000 })).toMatchObject({
      originalAmount: 4000,
      standing: { status: DebtStatus.OUTSTANDING, outstandingAmount: 4000 },
    })
  })

  it('settles the debt when the reduction covers what was left', () => {
    expect(reduceDebt({ originalAmount: 6000, paidAmount: 3000, reduction: 3000 })).toMatchObject({
      originalAmount: 3000,
      standing: { status: DebtStatus.SETTLED, outstandingAmount: 0 },
    })
  })

  it('never reduces a debt below what was already paid against it', () => {
    expect(reduceDebt({ originalAmount: 6000, paidAmount: 5000, reduction: 4000 })).toMatchObject({
      originalAmount: 5000,
      standing: { status: DebtStatus.SETTLED },
    })
  })
})

describe('checkDebtPayment', () => {
  it('takes a payment up to what is owed, in whole francs', () => {
    expect(checkDebtPayment({ amount: 2500.4, outstanding: 6000 })).toEqual({
      ok: true,
      amount: 2500,
    })
    expect(checkDebtPayment({ amount: 6000, outstanding: 6000 })).toEqual({
      ok: true,
      amount: 6000,
    })
  })
  it('refuses nothing, a non-number, or more than is owed', () => {
    expect(checkDebtPayment({ amount: 0, outstanding: 6000 })).toEqual({
      ok: false,
      code: 'DEBT_PAYMENT_AMOUNT_INVALID',
    })
    expect(checkDebtPayment({ amount: Number.NaN, outstanding: 6000 })).toEqual({
      ok: false,
      code: 'DEBT_PAYMENT_AMOUNT_INVALID',
    })
    expect(checkDebtPayment({ amount: 6001, outstanding: 6000 })).toEqual({
      ok: false,
      code: 'DEBT_PAYMENT_AMOUNT_EXCEEDS_OUTSTANDING',
    })
  })
})

describe('planDebtOffset', () => {
  it('nets the smaller side off both, oldest debt first', () => {
    const plan = planDebtOffset({
      receivables: [
        { id: 'r1', outstanding: 3000 },
        { id: 'r2', outstanding: 5000 },
      ],
      payables: [
        { id: 'p1', outstanding: 0 },
        { id: 'p2', outstanding: 4000 },
      ],
    })
    expect(plan).toEqual({
      ok: true,
      offsetAmount: 4000,
      receivableTotal: 8000,
      payableTotal: 4000,
      allocations: [
        { debt: { id: 'r1', outstanding: 3000 }, amount: 3000 },
        { debt: { id: 'r2', outstanding: 5000 }, amount: 1000 },
        { debt: { id: 'p2', outstanding: 4000 }, amount: 4000 },
      ],
    })
  })
  it('refuses when either side has nothing open', () => {
    expect(
      planDebtOffset({ receivables: [{ outstanding: 3000 }], payables: [{ outstanding: 0 }] }),
    ).toEqual({ ok: false, code: 'DEBT_OFFSET_NOTHING' })
  })
})
