import { dayKeyInTimezone, minutesOfDayInTimezone, weekdayInTimezone } from '../timezone.util'

describe('timezone.util', () => {
  // 2026-01-05 is a Monday. Assertions use fixed instants and check each zone's wall clock.
  const utcNoon = new Date('2026-01-05T12:00:00.000Z') // Monday 12:00 UTC

  describe('minutesOfDayInTimezone', () => {
    it('reads the wall-clock minute in the given zone', () => {
      // 12:00 UTC → 13:00 in Africa/Douala (UTC+1) → 13*60 = 780
      expect(minutesOfDayInTimezone(utcNoon, 'Africa/Douala')).toBe(13 * 60)
      // 12:00 UTC → 07:00 in America/New_York (UTC-5 in January) → 7*60 = 420
      expect(minutesOfDayInTimezone(utcNoon, 'America/New_York')).toBe(7 * 60)
    })

    it('falls back to server-local for an invalid zone', () => {
      const local = utcNoon.getHours() * 60 + utcNoon.getMinutes()
      expect(minutesOfDayInTimezone(utcNoon, 'Not/AZone')).toBe(local)
    })
  })

  describe('dayKeyInTimezone', () => {
    it('returns the local calendar date as YYYY-MM-DD', () => {
      expect(dayKeyInTimezone(utcNoon, 'Africa/Douala')).toBe('2026-01-05')
      // 12:00 UTC is 07:00 same day in New York
      expect(dayKeyInTimezone(utcNoon, 'America/New_York')).toBe('2026-01-05')
    })

    it('rolls the date across the local midnight boundary', () => {
      // 23:30 UTC on Mon → 00:30 Tue in Africa/Douala (UTC+1)
      const lateUtc = new Date('2026-01-05T23:30:00.000Z')
      expect(dayKeyInTimezone(lateUtc, 'Africa/Douala')).toBe('2026-01-06')
      // …but still 18:30 Mon in New York
      expect(dayKeyInTimezone(lateUtc, 'America/New_York')).toBe('2026-01-05')
    })
  })

  describe('weekdayInTimezone', () => {
    it('returns the lowercased 3-letter weekday matching WEEKDAYS', () => {
      expect(weekdayInTimezone(utcNoon, 'Africa/Douala')).toBe('mon')
    })

    it('respects the local date when the zone crosses midnight', () => {
      const lateUtc = new Date('2026-01-05T23:30:00.000Z') // Tue in Douala
      expect(weekdayInTimezone(lateUtc, 'Africa/Douala')).toBe('tue')
    })
  })
})
