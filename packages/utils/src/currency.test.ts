import { describe, expect, it } from 'vitest'
import { allocateProRata, roundToCashUnit, toWholeXaf } from './currency'

describe('toWholeXaf', () => {
  it('leaves whole numbers unchanged', () => {
    expect(toWholeXaf(0)).toBe(0)
    expect(toWholeXaf(1)).toBe(1)
    expect(toWholeXaf(1000)).toBe(1000)
  })

  it('rounds half away from zero', () => {
    expect(toWholeXaf(2.5)).toBe(3)
    expect(toWholeXaf(3.5)).toBe(4)
    expect(toWholeXaf(-2.5)).toBe(-3)
    expect(toWholeXaf(0.5)).toBe(1)
    expect(toWholeXaf(-0.5)).toBe(-1)
  })

  it('rounds sub-half down and super-half up', () => {
    expect(toWholeXaf(2.49)).toBe(2)
    expect(toWholeXaf(2.51)).toBe(3)
    expect(toWholeXaf(-2.49)).toBe(-2)
    expect(toWholeXaf(-2.51)).toBe(-3)
  })

  it('absorbs IEEE-754 drift so a mathematical x.5 never rounds down', () => {
    // 0.1 + 0.2 === 0.30000000000000004, and values that land just below x.5
    // because of binary floating point must still round as though exactly x.5.
    expect(toWholeXaf(0.1 + 0.2 + 2)).toBe(2) // 2.3000...4 → 2
    // 1.005 is actually stored as 1.00499999999999989 — a naive Math.round of
    // (x * 100) would give the wrong sub-unit; here we only round to whole XAF.
    const drift = 4.5 - 1e-12 // mathematically 4.5, stored a hair below
    expect(toWholeXaf(drift)).toBe(5)
  })

  it('returns 0 for non-finite input', () => {
    expect(toWholeXaf(NaN)).toBe(0)
    expect(toWholeXaf(Infinity)).toBe(0)
    expect(toWholeXaf(-Infinity)).toBe(0)
  })

  it('handles the 3.33% discount across 7 lines whose prices end in 5', () => {
    // A 3.333...% discount applied to seven identical 1,995 XAF lines. Each line
    // discount is 66.4999...5; rounding each independently must be deterministic
    // and the summed rounded discount must be reproducible for reconciliation.
    const rate = 1 / 30 // 3.333...%
    const price = 1995
    const perLine = toWholeXaf(price * rate) // 66.5 → 67
    expect(perLine).toBe(67)
    const lines = Array.from({ length: 7 }, () => toWholeXaf(price * rate))
    expect(lines.reduce((a, b) => a + b, 0)).toBe(469) // 7 * 67
  })
})

describe('allocateProRata', () => {
  const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)

  it('splits exactly among equal weights, remainder to the first (largest) line', () => {
    // 3.33% of a 7-line cart, every line priced 1995 (ends in 5) — the AC scenario.
    const lines = Array.from({ length: 7 }, () => 1995)
    const subtotal = sum(lines) // 13 965
    const discount = toWholeXaf(subtotal * 0.0333) // 465
    const alloc = allocateProRata(discount, lines)
    expect(sum(alloc)).toBe(discount) // exact, no remainder lost
    expect(alloc.every((a) => Number.isInteger(a))).toBe(true)
    // 465 / 7 = 66.43 → 66 each (462), remainder 3 to the largest (first) line.
    expect(alloc).toEqual([69, 66, 66, 66, 66, 66, 66])
  })

  it('allocates proportionally to weights and stays exact', () => {
    const alloc = allocateProRata(100, [300, 100, 100])
    expect(sum(alloc)).toBe(100)
    expect(alloc).toEqual([60, 20, 20])
  })

  it('absorbs the rounding remainder on the largest line', () => {
    const alloc = allocateProRata(100, [100, 100, 100])
    expect(sum(alloc)).toBe(100) // 33+33+33 = 99, +1 remainder → first line 34
    expect(alloc).toEqual([34, 33, 33])
  })

  it('returns zeros for a zero total or all-zero weights', () => {
    expect(allocateProRata(0, [10, 20])).toEqual([0, 0])
    expect(allocateProRata(500, [0, 0])).toEqual([0, 0])
  })

  it('ignores non-positive weights', () => {
    const alloc = allocateProRata(100, [100, 0, -50])
    expect(sum(alloc)).toBe(100)
    expect(alloc).toEqual([100, 0, 0])
  })
})

describe('roundToCashUnit', () => {
  it('defaults to whole XAF (unit 1, decision D10)', () => {
    expect(roundToCashUnit(2.5)).toBe(3)
    expect(roundToCashUnit(1234.4)).toBe(1234)
  })

  it('snaps to the nearest multiple of the given unit', () => {
    expect(roundToCashUnit(1234, 5)).toBe(1235)
    expect(roundToCashUnit(1232, 5)).toBe(1230)
    expect(roundToCashUnit(1240, 25)).toBe(1250)
    expect(roundToCashUnit(1237, 25)).toBe(1225)
    expect(roundToCashUnit(1275, 50)).toBe(1300)
    expect(roundToCashUnit(1249, 100)).toBe(1200)
    expect(roundToCashUnit(1250, 100)).toBe(1300)
  })

  it('snaps negatives half away from zero too', () => {
    expect(roundToCashUnit(-1234, 5)).toBe(-1235)
    expect(roundToCashUnit(-1275, 50)).toBe(-1300)
  })
})
