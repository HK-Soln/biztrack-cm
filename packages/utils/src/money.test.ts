import { describe, expect, it } from 'vitest'
import { currencyExponent, majorToMinor, minorToMajor } from './money'

describe('currency-aware money (minor units)', () => {
  it('XAF has zero minor units (minor == major)', () => {
    expect(currencyExponent('XAF')).toBe(0)
    expect(minorToMajor(5000, 'XAF')).toBe(5000)
    expect(majorToMinor(5000, 'XAF')).toBe(5000)
  })

  it('AED has two minor units (fils)', () => {
    expect(currencyExponent('AED')).toBe(2)
    expect(minorToMajor(1050, 'AED')).toBe(10.5)
    expect(majorToMinor(10.5, 'AED')).toBe(1050)
  })

  it('is case-insensitive and rounds cleanly', () => {
    expect(currencyExponent('aed')).toBe(2)
    expect(majorToMinor(10.005, 'AED')).toBe(1001) // banker-free round
    expect(minorToMajor(999, 'AED')).toBe(9.99)
  })

  it('round-trips major → minor → major', () => {
    for (const [amt, cur] of [
      [12.34, 'AED'],
      [7500, 'XAF'],
    ] as const) {
      expect(minorToMajor(majorToMinor(amt, cur), cur)).toBe(amt)
    }
  })
})
