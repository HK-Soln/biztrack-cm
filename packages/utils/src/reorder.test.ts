import { describe, expect, it } from 'vitest'
import {
  REORDER_MIN_HISTORY_DAYS,
  REORDER_MIN_UNITS,
  REORDER_WINDOW_DAYS,
  computeReorderVelocity,
  computeStockoutMs,
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
