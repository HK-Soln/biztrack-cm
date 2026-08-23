import { describe, expect, it } from 'vitest'
import { clampFiscalYearStartMonth, fiscalYearOf, generateFiscalPeriods } from './fiscal-calendar'

describe('clampFiscalYearStartMonth', () => {
  it('accepts 1–12 and defaults otherwise', () => {
    expect(clampFiscalYearStartMonth(1)).toBe(1)
    expect(clampFiscalYearStartMonth(4)).toBe(4)
    expect(clampFiscalYearStartMonth(12)).toBe(12)
    expect(clampFiscalYearStartMonth(0)).toBe(1)
    expect(clampFiscalYearStartMonth(13)).toBe(1)
    expect(clampFiscalYearStartMonth(null)).toBe(1)
    expect(clampFiscalYearStartMonth(undefined)).toBe(1)
  })
})

describe('generateFiscalPeriods — calendar year (start month 1)', () => {
  const fy = generateFiscalPeriods(2026, 1)

  it('spans the calendar year and is labelled by the year', () => {
    expect(fy.label).toBe('2026')
    expect(fy.startDate).toBe('2026-01-01')
    expect(fy.endDate).toBe('2026-12-31')
  })

  it('has 12 monthly periods with correct boundaries', () => {
    expect(fy.periods).toHaveLength(12)
    expect(fy.periods[0]).toMatchObject({
      periodNumber: 1,
      label: '2026-01',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    })
    // February 2026 is not a leap year → 28 days.
    expect(fy.periods[1]).toMatchObject({
      label: '2026-02',
      startDate: '2026-02-01',
      endDate: '2026-02-28',
    })
    expect(fy.periods[11]).toMatchObject({
      periodNumber: 12,
      label: '2026-12',
      startDate: '2026-12-01',
      endDate: '2026-12-31',
    })
  })
})

describe('generateFiscalPeriods — offset fiscal year (start month 4)', () => {
  const fy = generateFiscalPeriods(2026, 4)

  it('straddles two calendar years and is labelled across them', () => {
    expect(fy.label).toBe('2026/2027')
    expect(fy.startDate).toBe('2026-04-01')
    expect(fy.endDate).toBe('2027-03-31')
  })

  it('rolls the month over the year boundary', () => {
    expect(fy.periods[0]).toMatchObject({ label: '2026-04', startDate: '2026-04-01' })
    // Period 10 = January 2027.
    expect(fy.periods[9]).toMatchObject({
      periodNumber: 10,
      label: '2027-01',
      startDate: '2027-01-01',
      endDate: '2027-01-31',
    })
    expect(fy.periods[11]).toMatchObject({
      label: '2027-03',
      endDate: '2027-03-31',
    })
  })

  it('handles a leap February inside the fiscal year (start month 4, 2027/2028)', () => {
    const leap = generateFiscalPeriods(2027, 4)
    const feb = leap.periods.find((p) => p.label === '2028-02')
    expect(feb?.endDate).toBe('2028-02-29')
  })
})

describe('fiscalYearOf', () => {
  it('calendar year: the date year', () => {
    expect(fiscalYearOf('2026-01-15', 1)).toBe(2026)
    expect(fiscalYearOf('2026-12-31', 1)).toBe(2026)
  })

  it('offset year: a month before the start belongs to the prior fiscal year', () => {
    expect(fiscalYearOf('2026-04-01', 4)).toBe(2026) // first day of FY2026
    expect(fiscalYearOf('2026-03-31', 4)).toBe(2025) // still FY2025 (ends 2026-03-31)
    expect(fiscalYearOf('2027-01-10', 4)).toBe(2026) // Jan 2027 is inside FY2026
  })
})
