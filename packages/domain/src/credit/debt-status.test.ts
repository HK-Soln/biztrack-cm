import { describe, expect, it } from 'vitest'
import { DebtStatus } from '@biztrack/types'
import {
  allocatePaymentOldestFirst,
  checkDebtPayment,
  checkDebtWriteOff,
  checkSyncedDebt,
  debtAfterChange,
  debtBalance,
  debtCanBeWrittenOff,
  debtIsOpen,
  debtOutstandingSql,
  debtSettledAt,
  debtStanding,
  planDebtOffset,
  reduceDebt,
  sourceDebtPayment,
} from './debt-status'

describe('debtStanding', () => {
  it('is outstanding with nothing paid', () => {
    expect(debtStanding({ originalAmount: 10000, paidAmount: 0 })).toEqual({
      status: DebtStatus.OUTSTANDING,
      paidAmount: 0,
      outstandingAmount: 10000,
      unpaidAmount: 10000,
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

describe('debtBalance', () => {
  it('owes nothing once written off, and keeps what was left unpaid', () => {
    expect(
      debtBalance({ originalAmount: 10000, paidAmount: 4000, status: DebtStatus.WRITTEN_OFF }),
    ).toMatchObject({ status: DebtStatus.WRITTEN_OFF, outstandingAmount: 0, unpaidAmount: 6000 })
    expect(
      debtBalance({ originalAmount: 10000, paidAmount: 4000, status: DebtStatus.OUTSTANDING }),
    ).toMatchObject({ status: DebtStatus.PARTIALLY_PAID, outstandingAmount: 6000 })
  })
  it('knows which debts are open', () => {
    expect(debtIsOpen(DebtStatus.OUTSTANDING)).toBe(true)
    expect(debtIsOpen(DebtStatus.PARTIALLY_PAID)).toBe(true)
    expect(debtIsOpen(DebtStatus.SETTLED)).toBe(false)
    expect(debtIsOpen(DebtStatus.WRITTEN_OFF)).toBe(false)
    expect(debtOutstandingSql({ status: 'd.status', original: 'd.o', paid: 'p' })).toContain(
      "d.status IN ('OUTSTANDING', 'PARTIALLY_PAID')",
    )
  })
})

describe('debtAfterChange', () => {
  it('settles with the first date and keeps a written-off debt written off', () => {
    expect(
      debtAfterChange({
        originalAmount: 100,
        paidAmount: 100,
        status: DebtStatus.PARTIALLY_PAID,
        settledAt: null,
        at: 't2',
      }),
    ).toMatchObject({ status: DebtStatus.SETTLED, settledAt: 't2' })
    expect(
      debtAfterChange({
        originalAmount: 100,
        paidAmount: 100,
        status: DebtStatus.WRITTEN_OFF,
        settledAt: 't1',
        at: 't2',
      }),
    ).toMatchObject({ status: DebtStatus.WRITTEN_OFF, settledAt: null })
  })
})

describe('checkDebtPayment with status and dates', () => {
  it('refuses a settled or written-off debt and a payment dated before the debt', () => {
    expect(checkDebtPayment({ amount: 10, outstanding: 0, status: DebtStatus.SETTLED })).toEqual({
      ok: false,
      code: 'DEBT_PAYMENT_LOCKED',
    })
    expect(
      checkDebtPayment({
        amount: 10,
        outstanding: 100,
        status: DebtStatus.OUTSTANDING,
        paymentDate: '2026-01-01',
        debtCreatedDate: '2026-01-02T08:00:00.000Z',
      }),
    ).toEqual({ ok: false, code: 'DEBT_PAYMENT_DATE_INVALID' })
  })
})

describe('sourceDebtPayment', () => {
  it('takes at most what is owed, and nothing on a closed debt', () => {
    expect(
      sourceDebtPayment({ amount: 700, outstanding: 500, status: DebtStatus.OUTSTANDING }),
    ).toEqual({ applied: 500, excess: 200 })
    expect(
      sourceDebtPayment({ amount: 700, outstanding: 500, status: DebtStatus.WRITTEN_OFF }),
    ).toEqual({ applied: 0, excess: 700 })
  })
})

describe('checkSyncedDebt', () => {
  it('takes payments and reversals that add up to no more than the debt', () => {
    expect(checkSyncedDebt({ originalAmount: 1000, payments: [600, -200, 400.2] })).toEqual({
      ok: true,
      originalAmount: 1000,
      payments: [600, -200, 400],
      paidAmount: 800,
    })
  })
  it('refuses overpayment, empty payments and a negative debt', () => {
    expect(checkSyncedDebt({ originalAmount: 1000, payments: [600, 500] })).toEqual({
      ok: false,
      code: 'DEBT_PAYMENTS_EXCEED_ORIGINAL',
    })
    expect(checkSyncedDebt({ originalAmount: 1000, payments: [0] })).toMatchObject({
      code: 'DEBT_PAYMENT_AMOUNT_INVALID',
    })
    expect(checkSyncedDebt({ originalAmount: -1, payments: [] })).toMatchObject({
      code: 'DEBT_AMOUNT_INVALID',
    })
  })
})

describe('allocatePaymentOldestFirst', () => {
  it('fills the oldest debts first and reports what is left', () => {
    const result = allocatePaymentOldestFirst(
      [
        { id: 'a', outstanding: 300 },
        { id: 'b', outstanding: 0 },
        { id: 'c', outstanding: 500 },
      ],
      600,
    )
    expect(result.allocations.map((a) => [a.debt.id, a.amount])).toEqual([
      ['a', 300],
      ['c', 300],
    ])
    expect(result).toMatchObject({ applied: 600, remaining: 0 })
    expect(allocatePaymentOldestFirst([{ outstanding: 100 }], 150).remaining).toBe(50)
  })
})

describe('checkDebtWriteOff', () => {
  it('writes off an open debt with a reason', () => {
    expect(checkDebtWriteOff({ status: DebtStatus.OUTSTANDING, reason: ' lost ' })).toEqual({
      ok: true,
      reason: 'lost',
    })
    expect(checkDebtWriteOff({ status: DebtStatus.SETTLED, reason: 'x' })).toMatchObject({
      code: 'DEBT_ALREADY_SETTLED',
    })
    expect(checkDebtWriteOff({ status: DebtStatus.OUTSTANDING, reason: ' ' })).toMatchObject({
      code: 'DEBT_WRITE_OFF_REASON_REQUIRED',
    })
  })
})
