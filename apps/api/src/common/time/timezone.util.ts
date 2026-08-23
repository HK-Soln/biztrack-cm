import type { Weekday } from '@biztrack/types'

/**
 * IANA-timezone-aware "wall clock" helpers. The API server can run in any region, so
 * anything the business perceives in local terms — quiet hours, the business day,
 * scheduled digests relative to closing time — must be evaluated in the business's own
 * zone, never the server's. All three read `now` through `Intl.DateTimeFormat` with the
 * given zone and fall back to server-local if the zone is missing/invalid.
 */

/** Minutes-since-midnight at `now`, read in `timezone`. */
export function minutesOfDayInTimezone(now: Date, timezone?: string): number {
  if (timezone) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(now)
      const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24
      const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0')
      return h * 60 + m
    } catch {
      // Invalid timezone → fall through to server-local.
    }
  }
  return now.getHours() * 60 + now.getMinutes()
}

/** Calendar date at `now` in `timezone`, as an 'YYYY-MM-DD' day key (en-CA is ISO-shaped). */
export function dayKeyInTimezone(now: Date, timezone?: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now)
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now)
  }
}

const WEEKDAY_MAP: Record<string, Weekday> = {
  Mon: 'mon',
  Tue: 'tue',
  Wed: 'wed',
  Thu: 'thu',
  Fri: 'fri',
  Sat: 'sat',
  Sun: 'sun',
}

/** The weekday at `now` in `timezone` ('mon'…'sun'), matching @biztrack/types WEEKDAYS. */
export function weekdayInTimezone(now: Date, timezone?: string): Weekday {
  let short: string
  try {
    short = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(now)
  } catch {
    short = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(now)
  }
  return WEEKDAY_MAP[short] ?? 'mon'
}
