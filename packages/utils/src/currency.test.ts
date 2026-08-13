import { describe, expect, it } from 'vitest'
import { roundToCashUnit, toWholeXaf } from './currency'

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
