import { describe, expect, it } from 'vitest'
import { DebtStatus } from '@biztrack/types'
import { debtSettledAt, debtStanding } from './debt-status'

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
