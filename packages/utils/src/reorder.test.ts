import { describe, expect, it } from 'vitest'
import {
  REORDER_MIN_HISTORY_DAYS,
  REORDER_MIN_UNITS,
  REORDER_WINDOW_DAYS,
  buildReorderDigest,
  computeReorderVelocity,
  computeRevenueAtRisk,
  computeStockoutMs,
  type ReorderDigestLineInput,
} from './reorder'

const DAY = 86_400_000
const now = 1_000 * DAY // arbitrary fixed epoch (Date.now avoided for determinism)
const windowStart = now - REORDER_WINDOW_DAYS * DAY

describe('computeStockoutMs', () => {
  it('never in stock-out when levels stay positive', () => {
    expect(computeStockoutMs(windowStart, now, 5, [{ at: now - 10 * DAY, after: 3 }])).toBe(0)
  })

  it('counts the tail after stock hits zero to now()', () => {
    // Drops to 0 five days ago and never recovers → 5 days of stock-out.
    const out = computeStockoutMs(windowStart, now, 4, [{ at: now - 5 * DAY, after: 0 }])
    expect(out).toBe(5 * DAY)
  })

  it('counts a stretch between two movements, then recovery clears it', () => {
    // empty from day-20 to day-12 (8 days), restocked at day-12, positive since.
    const out = computeStockoutMs(windowStart, now, 2, [
      { at: now - 20 * DAY, after: 0 },
      { at: now - 12 * DAY, after: 30 },
    ])
    expect(out).toBe(8 * DAY)
  })

  it('counts a window that starts empty', () => {
    // startStock 0, restocked 25 days ago → first 3 days empty.
    const out = computeStockoutMs(windowStart, now, 0, [{ at: now - 25 * DAY, after: 10 }])
    expect(out).toBe(3 * DAY)
  })

  it('returns 0 for a degenerate window', () => {
    expect(computeStockoutMs(now, now, 0, [])).toBe(0)
  })
})

describe('computeReorderVelocity', () => {
  const base = {
    windowDays: REORDER_WINDOW_DAYS,
    stockoutMs: 0,
    currentStock: 40,
    productAgeDays: 90,
  }

  it('divides by sellable days (velocity is per in-stock day)', () => {
    // 28 units, 14 days out of stock → 14 sellable days → 2 units/day; 40 in stock → 20 days.
    const r = computeReorderVelocity({ ...base, unitsSold: 28, stockoutMs: 14 * DAY })
    expect(r.trusted).toBe(true)
    expect(r.velocity).toBe(2)
    expect(r.daysCover).toBe(20)
    expect(r.stockoutDays).toBe(14)
  })

  it('uses the full window when never out of stock', () => {
    // 56 units over 28 sellable days → 2/day; 40 → 20 days.
    const r = computeReorderVelocity({ ...base, unitsSold: 56 })
    expect(r.velocity).toBe(2)
    expect(r.daysCover).toBe(20)
  })

  it('stays silent below the history guard', () => {
    const r = computeReorderVelocity({
      ...base,
      unitsSold: 50,
      productAgeDays: REORDER_MIN_HISTORY_DAYS - 1,
    })
    expect(r).toMatchObject({ velocity: null, daysCover: null, trusted: false })
  })

  it('stays silent below the units guard', () => {
    const r = computeReorderVelocity({ ...base, unitsSold: REORDER_MIN_UNITS - 1 })
    expect(r).toMatchObject({ velocity: null, daysCover: null, trusted: false })
  })

  it('reports 0 days cover when out of stock but selling', () => {
    const r = computeReorderVelocity({ ...base, unitsSold: 28, currentStock: 0 })
    expect(r.trusted).toBe(true)
    expect(r.daysCover).toBe(0)
  })
})

describe('computeRevenueAtRisk', () => {
  it('uses price × velocity when velocity is trusted', () => {
    expect(computeRevenueAtRisk({ sellingPrice: 500, velocity: 4, suggestedQty: 20 })).toBe(2000)
  })
  it('falls back to price × suggestedQty when velocity is null', () => {
    expect(computeRevenueAtRisk({ sellingPrice: 500, velocity: null, suggestedQty: 20 })).toBe(
      10000,
    )
  })
  it('is 0 with no selling price', () => {
    expect(computeRevenueAtRisk({ sellingPrice: null, velocity: 4, suggestedQty: 20 })).toBe(0)
  })
})

describe('buildReorderDigest', () => {
  const line = (o: Partial<ReorderDigestLineInput>): ReorderDigestLineInput => ({
    productId: 'p',
    name: 'P',
    sku: null,
    currentStock: 0,
    suggestedQty: 10,
    unitCost: 100,
    sellingPrice: 500,
    currency: 'XAF',
    velocity: null,
    supplierId: null,
    supplierName: null,
    ...o,
  })

  it('groups by supplier and ranks groups by revenue-at-risk, no-supplier last', () => {
    const d = buildReorderDigest(
      [
        line({
          productId: 'a',
          supplierId: 's1',
          supplierName: 'Alpha',
          velocity: 2,
          sellingPrice: 1000,
        }), // 2000/day
        line({
          productId: 'b',
          supplierId: 's2',
          supplierName: 'Beta',
          velocity: 10,
          sellingPrice: 1000,
        }), // 10000/day
        line({ productId: 'c', supplierId: null }), // no supplier → order value 5000
      ],
      { currency: 'XAF', generatedAt: '2026-08-20T00:00:00Z' },
    )
    expect(d.productCount).toBe(3)
    expect(d.supplierGroups.map((g) => g.supplierId)).toEqual(['s2', 's1', null])
    expect(d.totalRevenueAtRisk).toBe(2000 + 10000 + 5000)
  })

  it('sorts lines within a group worst-first and sums est order cost', () => {
    const d = buildReorderDigest(
      [
        line({
          productId: 'a',
          supplierId: 's1',
          velocity: 1,
          sellingPrice: 1000,
          suggestedQty: 5,
          unitCost: 200,
        }),
        line({
          productId: 'b',
          supplierId: 's1',
          velocity: 9,
          sellingPrice: 1000,
          suggestedQty: 3,
          unitCost: 100,
        }),
      ],
      { currency: 'XAF', generatedAt: 'now' },
    )
    const g = d.supplierGroups[0]!
    expect(g.lines.map((l) => l.productId)).toEqual(['b', 'a'])
    expect(g.estOrderCost).toBe(5 * 200 + 3 * 100)
  })
})
