import { describe, expect, it } from 'vitest'
import {
  netCashierRoster,
  netDailySales,
  netGrossSales,
  netSalesSummary,
  refundsReport,
  returnTotals,
  returnTotalsBy,
  type ReportReturnLine,
} from './sales-report-net'

// A line of 3 sold for 3 000 (1 000 each, after discounts), 1 returned.
const line = (over: Partial<ReportReturnLine> = {}): ReportReturnLine => ({
  returnId: 'r1',
  restock: true,
  returnedQuantity: 1,
  soldQuantity: 3,
  lineTotal: 3000,
  costPrice: 600,
  ...over,
})

describe('returnTotalsBy', () => {
  it('values each return at the price charged and counts distinct returns per key', () => {
    const totals = returnTotalsBy(
      [
        line(),
        line({ returnedQuantity: 2 }),
        line({ returnId: 'r2', lineTotal: 1000, soldQuantity: 1 }),
        line({ returnId: 'r3' }),
      ],
      (l) => (l.returnId === 'r3' ? 'b' : 'a'),
    )
    expect(totals.get('a')).toEqual({ returns: 2, quantity: 4, value: 4000 })
    expect(totals.get('b')).toEqual({ returns: 1, quantity: 1, value: 1000 })
  })

  it('values a return at the price charged whether or not it was restocked', () => {
    expect(returnTotals([line({ restock: false })]).value).toBe(1000)
  })

  it('is empty without returns', () => {
    expect(returnTotals([])).toEqual({ returns: 0, quantity: 0, value: 0 })
  })
})

describe('netSalesSummary', () => {
  it('takes the returns off revenue and units, and counts them as refunds beside voids', () => {
    expect(
      netSalesSummary({
        soldRevenue: 10000,
        transactions: 4,
        soldUnits: 10,
        returns: { returns: 1, quantity: 2, value: 2000 },
        voids: { count: 1, amount: 5000 },
      }),
    ).toEqual({
      revenue: 8000,
      transactions: 4,
      averageBasket: 2000,
      itemsSold: 8,
      refundCount: 2,
      refundAmount: 7000,
    })
  })

  it('has no basket without sales', () => {
    const summary = netSalesSummary({
      soldRevenue: 0,
      transactions: 0,
      soldUnits: 0,
      returns: { returns: 1, quantity: 1, value: 500 },
      voids: { count: 0, amount: 0 },
    })
    expect(summary.averageBasket).toBe(0)
    expect(summary.revenue).toBe(-500)
  })
})

describe('netDailySales', () => {
  it('takes returns off the day of the return and refund payments off their tender', () => {
    const rows = netDailySales({
      sold: [
        {
          date: '2026-10-02',
          transactions: 2,
          total: 5000,
          cash: 3000,
          momo: 2000,
          card: 0,
          credit: 0,
        },
        {
          date: '2026-10-01',
          transactions: 1,
          total: 4000,
          cash: 0,
          momo: 0,
          card: 0,
          credit: 4000,
        },
      ],
      returns: new Map([
        ['2026-10-02', { returns: 1, quantity: 1, value: 1000 }],
        ['2026-10-03', { returns: 1, quantity: 1, value: 700 }],
      ]),
      refundPayments: [
        { date: '2026-10-02', cash: 1000, momo: 0, card: 0 },
        { date: '2026-10-03', cash: 0, momo: 700, card: 0 },
      ],
    })
    expect(rows).toEqual([
      { date: '2026-10-01', transactions: 1, total: 4000, cash: 0, momo: 0, card: 0, credit: 4000 },
      {
        date: '2026-10-02',
        transactions: 2,
        total: 4000,
        cash: 2000,
        momo: 2000,
        card: 0,
        credit: 0,
      },
      { date: '2026-10-03', transactions: 0, total: -700, cash: 0, momo: -700, card: 0, credit: 0 },
    ])
  })
})

describe('netCashierRoster', () => {
  it('takes returns off the selling cashier and adds them to their refunds', () => {
    const rows = netCashierRoster(
      [
        {
          cashierId: 'a',
          name: 'Ama',
          shifts: 2,
          transactions: 5,
          sales: 9000,
          refunds: 1000,
          discounts: 300,
        },
        {
          cashierId: 'b',
          name: 'Ben',
          shifts: 1,
          transactions: 2,
          sales: 8500,
          refunds: 0,
          discounts: 0,
        },
      ],
      [
        { cashierId: 'b', name: 'Ben', returns: 1, quantity: 1, value: 1500 },
        { cashierId: 'c', name: 'Cam', returns: 1, quantity: 1, value: 400 },
      ],
    )
    expect(rows.map((r) => [r.cashierId, r.sales, r.refunds])).toEqual([
      ['a', 9000, 1000],
      ['b', 7000, 1500],
      ['c', -400, 400],
    ])
  })
})

describe('refundsReport', () => {
  it('merges voids and returns by reason and by cashier', () => {
    const report = refundsReport({
      voidsByReason: [{ reason: 'Wrong item', count: 1, amount: 2000 }],
      returnsByReason: new Map<string | null, { returns: number; quantity: number; value: number }>(
        [
          ['Wrong item', { returns: 2, quantity: 2, value: 1500 }],
          [null, { returns: 1, quantity: 1, value: 4000 }],
        ],
      ),
      voidsByCashier: [
        { cashierId: 'a', name: 'Ama', refunds: 2000, sales: 10000 },
        { cashierId: 'b', name: 'Ben', refunds: 0, sales: 6000 },
        { cashierId: 'c', name: 'Cam', refunds: 0, sales: 3000 },
      ],
      returnsByCashier: [{ cashierId: 'b', name: 'Ben', returns: 3, quantity: 3, value: 5500 }],
      grossSales: 19000,
    })
    expect(report.byReason).toEqual([
      { reason: null, count: 1, amount: 4000 },
      { reason: 'Wrong item', count: 3, amount: 3500 },
    ])
    expect(report.byCashier).toEqual([
      { cashierId: 'b', name: 'Ben', refunds: 5500, sales: 6000 },
      { cashierId: 'a', name: 'Ama', refunds: 2000, sales: 10000 },
    ])
    expect(report.grossSales).toBe(19000)
  })
})

describe('netGrossSales', () => {
  it('takes the returns off', () => {
    expect(netGrossSales(10000, { returns: 1, quantity: 1, value: 2500 })).toBe(7500)
    expect(netGrossSales(10000)).toBe(10000)
  })
})
