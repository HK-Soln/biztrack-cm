import { describe, expect, it } from 'vitest'
import { incomeStatement } from './income-statement'
import { comparisonPeriod, roundPercent, summarizeAmounts } from './period-summary'

describe('comparisonPeriod', () => {
  it('counts both ends and compares with the same number of days just before', () => {
    expect(comparisonPeriod('2026-10-01', '2026-10-31')).toEqual({
      days: 31,
      previousFrom: '2026-08-31',
      previousTo: '2026-09-30',
    })
    expect(comparisonPeriod('2026-10-15', '2026-10-15')).toEqual({
      days: 1,
      previousFrom: '2026-10-14',
      previousTo: '2026-10-14',
    })
  })

  it('accepts full timestamps and reads only the day', () => {
    expect(comparisonPeriod('2026-03-01T00:00:00.000Z', '2026-03-07T23:59:59.999Z').days).toBe(7)
  })
})

describe('summarizeAmounts', () => {
  it('totals, compares, averages and shares in whole francs and one-decimal percents', () => {
    const summary = summarizeAmounts({
      categories: [
        { key: 'rent', amount: 20000 },
        { key: 'fuel', amount: 10000.4 },
      ],
      previousTotal: 24000,
      days: 30,
    })
    expect(summary).toEqual({
      total: 30000,
      previousTotal: 24000,
      changePct: 25,
      avgPerDay: 1000,
      categories: [
        { key: 'rent', amount: 20000, percentage: 66.7 },
        { key: 'fuel', amount: 10000, percentage: 33.3 },
      ],
    })
  })

  it('shows no change with nothing to compare to, and thirty days with no range', () => {
    const summary = summarizeAmounts({ categories: [{ key: 'a', amount: 3000 }] })
    expect(summary).toMatchObject({ changePct: 0, avgPerDay: 100 })
  })

  it('has no shares with nothing spent', () => {
    expect(summarizeAmounts({ categories: [{ key: 'a', amount: 0 }] }).categories).toEqual([
      { key: 'a', amount: 0, percentage: 0 },
    ])
  })

  it('rounds percents to one decimal', () => {
    expect(roundPercent(12.345)).toBe(12.3)
    expect(roundPercent(Number.NaN)).toBe(0)
  })
})

describe('incomeStatement', () => {
  it('works out gross and net profit', () => {
    expect(
      incomeStatement({
        revenue: 100000,
        costOfGoods: 60000,
        otherIncome: 5000,
        totalExpenses: 15000,
      }),
    ).toEqual({
      revenue: 100000,
      costOfGoods: 60000,
      grossProfit: 40000,
      grossMarginPercent: 40,
      otherIncome: 5000,
      totalExpenses: 15000,
      netProfit: 30000,
      netMarginPercent: 30,
    })
  })

  it('has no margin with no revenue and can be a loss', () => {
    expect(incomeStatement({ revenue: 0, costOfGoods: 0, totalExpenses: 2000 })).toMatchObject({
      grossMarginPercent: 0,
      netProfit: -2000,
    })
  })
})
