import { describe, expect, it } from 'vitest'
import { computeBusinessDate, localDateInTimezone, parseCutoverMinutes } from './business-calendar'

describe('parseCutoverMinutes', () => {
  it('parses HH:mm to minutes', () => {
    expect(parseCutoverMinutes('00:00')).toBe(0)
    expect(parseCutoverMinutes('03:00')).toBe(180)
    expect(parseCutoverMinutes('06:30')).toBe(390)
  })

  it('falls back to 0 for missing or invalid input', () => {
    expect(parseCutoverMinutes(null)).toBe(0)
    expect(parseCutoverMinutes(undefined)).toBe(0)
    expect(parseCutoverMinutes('')).toBe(0)
    expect(parseCutoverMinutes('nope')).toBe(0)
    expect(parseCutoverMinutes('25:00')).toBe(0)
    expect(parseCutoverMinutes('12:70')).toBe(0)
  })
})

describe('localDateInTimezone', () => {
  it('uses the business timezone, not UTC (the Douala +1 edge)', () => {
    // 2026-08-16T23:30Z is already 2026-08-17 00:30 in Africa/Douala (UTC+1).
    const instant = new Date('2026-08-16T23:30:00Z')
    expect(localDateInTimezone(instant, 'Africa/Douala')).toBe('2026-08-17')
    expect(localDateInTimezone(instant, 'UTC')).toBe('2026-08-16')
  })
})

describe('computeBusinessDate', () => {
  it('with the default midnight cutover, is the local calendar date', () => {
    // 09:00 Douala time on the 16th.
    const instant = new Date('2026-08-16T08:00:00Z')
    expect(computeBusinessDate(instant, { timezone: 'Africa/Douala' })).toBe('2026-08-16')
  })

  it('a late sale before a dead-hour cutover counts to the previous trading day', () => {
    // 01:00 Douala time on the 17th, cutover 03:00 → previous day (the 16th).
    const instant = new Date('2026-08-17T00:00:00Z') // 01:00 in Douala
    expect(computeBusinessDate(instant, { timezone: 'Africa/Douala', cutover: '03:00' })).toBe(
      '2026-08-16',
    )
  })

  it('a sale after the cutover counts to the current trading day', () => {
    // 05:00 Douala time on the 17th, cutover 03:00 → the 17th.
    const instant = new Date('2026-08-17T04:00:00Z') // 05:00 in Douala
    expect(computeBusinessDate(instant, { timezone: 'Africa/Douala', cutover: '03:00' })).toBe(
      '2026-08-17',
    )
  })

  it('a sale exactly at the cutover counts to the current trading day', () => {
    // 03:00 Douala time, cutover 03:00 → shifted to 00:00 → same day.
    const instant = new Date('2026-08-17T02:00:00Z') // 03:00 in Douala
    expect(computeBusinessDate(instant, { timezone: 'Africa/Douala', cutover: '03:00' })).toBe(
      '2026-08-17',
    )
  })

  it('defaults to Africa/Douala when no timezone is given', () => {
    const instant = new Date('2026-08-16T23:30:00Z') // 00:30 next day in Douala
    expect(computeBusinessDate(instant)).toBe('2026-08-17')
  })

  it('accepts an ISO string or epoch millis', () => {
    expect(computeBusinessDate('2026-08-16T08:00:00Z', { timezone: 'Africa/Douala' })).toBe(
      '2026-08-16',
    )
    expect(
      computeBusinessDate(new Date('2026-08-16T08:00:00Z').getTime(), {
        timezone: 'Africa/Douala',
      }),
    ).toBe('2026-08-16')
  })
})
