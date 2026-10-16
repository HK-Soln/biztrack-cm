import { describe, expect, it } from 'vitest'
import {
  annualiseFactor,
  catalogValue,
  daysSince,
  deadStock,
  inventoryTurnover,
  roundReportAmount,
  supplierPriceTrend,
} from './stock-reports'

const NOW = Date.parse('2026-10-16T12:00:00.000Z')
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString()

describe('stock report helpers', () => {
  it('rounds to two decimals, the same on both sides', () => {
    expect(roundReportAmount(1.005)).toBe(1.01)
    expect(roundReportAmount(NaN)).toBe(0)
  })
  it('annualises by the inclusive period', () => {
    expect(annualiseFactor('2026-01-01', '2026-01-31')).toBeCloseTo(365 / 31)
    expect(annualiseFactor(undefined, '2026-01-31')).toBe(1)
  })
  it('counts whole days', () => {
    expect(daysSince(daysAgo(3.5), NOW)).toBe(3)
    expect(daysSince(null, NOW)).toBeNull()
  })
})

describe('inventoryTurnover', () => {
  it('annualises the cost of goods, largest stock first', () => {
    expect(
      inventoryTurnover({
        stock: [
          { productId: 'a', name: 'A', stockCost: 100 },
          { productId: 'b', name: 'B', stockCost: 300 },
        ],
        cogsByProduct: new Map([['a', 10]]),
        dateFrom: '2026-01-01',
        dateTo: '2026-01-05',
      }),
    ).toEqual([
      { productId: 'b', name: 'B', avgStockCost: 300, annualCogs: 0 },
      { productId: 'a', name: 'A', avgStockCost: 100, annualCogs: 730 },
    ])
  })
})

describe('deadStock', () => {
  it('keeps products unsold for 60 days or never sold', () => {
    const report = deadStock({
      stock: [
        { productId: 'a', name: 'A', sku: null, quantity: 1, costValue: 10 },
        { productId: 'b', name: 'B', sku: null, quantity: 1, costValue: 20 },
        { productId: 'c', name: 'C', sku: null, quantity: 1, costValue: 30 },
      ],
      lastSoldAt: new Map([
        ['a', daysAgo(61)],
        ['b', daysAgo(5)],
      ]),
      nowMs: NOW,
    })
    expect(report.stockCostTotal).toBe(60)
    expect(report.rows.map((r) => [r.productId, r.daysSinceLastSale])).toEqual([
      ['a', 61],
      ['c', null],
    ])
  })
})

describe('supplierPriceTrend', () => {
  it('reads the cost now and in effect 90 and 180 days ago', () => {
    expect(
      supplierPriceTrend(
        [
          { productId: 'a', name: 'A', supplier: 'S1', unitCost: 100, createdAt: daysAgo(200) },
          { productId: 'a', name: 'A', supplier: 'S1', unitCost: 120, createdAt: daysAgo(100) },
          { productId: 'a', name: 'A', supplier: 'S2', unitCost: 150, createdAt: daysAgo(10) },
        ],
        NOW,
      ),
    ).toEqual([
      { productId: 'a', name: 'A', supplier: 'S2', cost6mo: 100, cost3mo: 120, current: 150 },
    ])
  })
})

describe('catalogValue', () => {
  it('rounds the values and works out the blended margin', () => {
    expect(catalogValue({ costValue: 600.004, retailValue: 1000 })).toEqual({
      catalogValueCost: 600,
      retailValue: 1000,
      blendedMarginPct: 40,
    })
    expect(catalogValue({ costValue: 0, retailValue: 0 }).blendedMarginPct).toBe(0)
  })
})
