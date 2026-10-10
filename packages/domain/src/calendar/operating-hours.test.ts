import { describe, expect, it } from 'vitest'
import type { BusinessHours } from '@biztrack/types'
import {
  countTradingDays,
  isTradingDate,
  isTradingDay,
  isWithinOperatingHours,
  weekdayOfDate,
} from './operating-hours'

// Mon–Sat 08:00–20:00, Sunday closed.
const HOURS: BusinessHours = {
  mon: { open: '08:00', close: '20:00' },
  tue: { open: '08:00', close: '20:00' },
  wed: { open: '08:00', close: '20:00' },
  thu: { open: '08:00', close: '20:00' },
  fri: { open: '08:00', close: '20:00' },
  sat: { open: '08:00', close: '20:00' },
  sun: null,
}

describe('weekdayOfDate', () => {
  it('reads the weekday of a date', () => {
    expect(weekdayOfDate('2026-08-17')).toBe('mon') // 2026-08-17 is a Monday
    expect(weekdayOfDate('2026-08-16')).toBe('sun')
    expect(weekdayOfDate('2026-08-22')).toBe('sat')
  })
})

describe('isTradingDay / isTradingDate', () => {
  it('respects closed days and open days', () => {
    expect(isTradingDay(HOURS, 'mon')).toBe(true)
    expect(isTradingDay(HOURS, 'sun')).toBe(false)
    expect(isTradingDate(HOURS, '2026-08-16')).toBe(false) // Sunday
    expect(isTradingDate(HOURS, '2026-08-17')).toBe(true) // Monday
  })

  it('treats never-configured hours as open every day', () => {
    expect(isTradingDay(null, 'sun')).toBe(true)
    expect(isTradingDate(undefined, '2026-08-16')).toBe(true)
  })
})

describe('isWithinOperatingHours', () => {
  it('is inside the window on a trading day', () => {
    expect(isWithinOperatingHours(HOURS, 'mon', '12:00')).toBe(true)
    expect(isWithinOperatingHours(HOURS, 'mon', '08:00')).toBe(true)
    expect(isWithinOperatingHours(HOURS, 'mon', '20:00')).toBe(true)
  })
  it('is outside before/after hours or on a closed day', () => {
    expect(isWithinOperatingHours(HOURS, 'mon', '07:59')).toBe(false)
    expect(isWithinOperatingHours(HOURS, 'mon', '20:01')).toBe(false)
    expect(isWithinOperatingHours(HOURS, 'sun', '12:00')).toBe(false)
  })
  it('handles an overnight window (close < open)', () => {
    const bar: BusinessHours = { ...HOURS, fri: { open: '20:00', close: '02:00' } }
    expect(isWithinOperatingHours(bar, 'fri', '23:00')).toBe(true)
    expect(isWithinOperatingHours(bar, 'fri', '01:00')).toBe(true)
    expect(isWithinOperatingHours(bar, 'fri', '12:00')).toBe(false)
  })
})

describe('countTradingDays', () => {
  it('counts trading days in a range, excluding closed Sundays', () => {
    // 2026-08-17 (Mon) … 2026-08-23 (Sun) = a full week → 6 trading days (Sun closed).
    expect(countTradingDays(HOURS, '2026-08-17', '2026-08-23')).toBe(6)
    // A single Sunday → 0.
    expect(countTradingDays(HOURS, '2026-08-16', '2026-08-16')).toBe(0)
    // Mon–Fri → 5.
    expect(countTradingDays(HOURS, '2026-08-17', '2026-08-21')).toBe(5)
  })
  it('counts every day when hours are unset, and 0 for an inverted range', () => {
    expect(countTradingDays(null, '2026-08-17', '2026-08-23')).toBe(7)
    expect(countTradingDays(HOURS, '2026-08-23', '2026-08-17')).toBe(0)
  })
})
