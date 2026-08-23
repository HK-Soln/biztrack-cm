import { describe, expect, it } from 'vitest'
import { isStrongPin, pinWeakness } from './pin'

describe('pinWeakness', () => {
  it('rejects non-6-digit input as FORMAT', () => {
    expect(pinWeakness('12345')).toBe('FORMAT')
    expect(pinWeakness('1234567')).toBe('FORMAT')
    expect(pinWeakness('12a456')).toBe('FORMAT')
    expect(pinWeakness('')).toBe('FORMAT')
  })

  it('rejects ≥3 identical digits in a row as REPEATED', () => {
    expect(pinWeakness('111111')).toBe('REPEATED')
    expect(pinWeakness('122234')).toBe('REPEATED') // run in the middle
    expect(pinWeakness('455567')).toBe('REPEATED')
    expect(pinWeakness('900012')).toBe('REPEATED')
  })

  it('rejects ascending/descending sequences as SEQUENTIAL', () => {
    expect(pinWeakness('123456')).toBe('SEQUENTIAL')
    expect(pinWeakness('654321')).toBe('SEQUENTIAL')
    expect(pinWeakness('234567')).toBe('SEQUENTIAL')
    expect(pinWeakness('987654')).toBe('SEQUENTIAL')
  })

  it('rejects low-entropy repeating groups as PATTERN', () => {
    expect(pinWeakness('001122')).toBe('PATTERN') // AABBCC
    expect(pinWeakness('112233')).toBe('PATTERN') // AABBCC
    expect(pinWeakness('224466')).toBe('PATTERN') // AABBCC (non-sequential pairs)
    expect(pinWeakness('010101')).toBe('PATTERN') // ABABAB
    expect(pinWeakness('121212')).toBe('PATTERN') // ABABAB
    expect(pinWeakness('123123')).toBe('PATTERN') // ABCABC
  })

  it('rejects a blocklist of other well-known PINs as COMMON', () => {
    expect(pinWeakness('159753')).toBe('COMMON')
    expect(pinWeakness('147258')).toBe('COMMON')
  })

  it('accepts a reasonably unpredictable PIN', () => {
    expect(pinWeakness('273914')).toBeNull()
    expect(pinWeakness('820473')).toBeNull()
    expect(pinWeakness('194620')).toBeNull()
    expect(isStrongPin('273914')).toBe(true)
    expect(isStrongPin('111111')).toBe(false)
    expect(isStrongPin('123456')).toBe(false)
  })

  it('allows two identical digits in a row (only ≥3 is rejected)', () => {
    // 668041 has a pair but no triple, no sequence, not blocklisted.
    expect(pinWeakness('668041')).toBeNull()
  })
})
