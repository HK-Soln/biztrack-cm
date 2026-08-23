import { type BusinessHours, type Weekday } from '@biztrack/types'

// BIZ-5.9 — operating days & hours as a REPORTING dimension. Turns the per-weekday business_hours
// setting into the facts reports need: which days the shop trades (so a closed day is not confused
// with an open day that had zero sales, and "daily averages" divide by trading days not 7), and
// whether a timestamp falls outside operating hours (an anomaly worth surfacing).

// getUTCDay() index (0=Sun) → our Weekday. Dates are 'YYYY-MM-DD' local calendar dates whose
// weekday is unambiguous, so we read it in UTC to avoid any timezone drift.
const WEEKDAY_BY_INDEX: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

const toMinutes = (hhmm: string): number => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return 0
  return Number(m[1]) * 60 + Number(m[2])
}

/** The weekday of a 'YYYY-MM-DD' date. */
export function weekdayOfDate(date: string): Weekday {
  const [y, m, d] = date.split('-').map(Number)
  return WEEKDAY_BY_INDEX[new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay()]!
}

/** Is `weekday` a trading day? Null hours (never configured) means open every day — matching the
 *  Settings default; an explicitly-null day is closed. */
export function isTradingDay(hours: BusinessHours | null | undefined, weekday: Weekday): boolean {
  if (!hours) return true
  return hours[weekday] != null
}

/** Is the 'YYYY-MM-DD' date a trading day? */
export function isTradingDate(hours: BusinessHours | null | undefined, date: string): boolean {
  return isTradingDay(hours, weekdayOfDate(date))
}

/** Is the local time 'HH:mm' within the day's operating window? A closed day is always false.
 *  Supports an overnight window (close < open, e.g. 20:00–02:00). Null hours = always open. */
export function isWithinOperatingHours(
  hours: BusinessHours | null | undefined,
  weekday: Weekday,
  hhmm: string,
): boolean {
  if (!hours) return true
  const day = hours[weekday]
  if (!day) return false
  const cur = toMinutes(hhmm)
  const open = toMinutes(day.open)
  const close = toMinutes(day.close)
  if (close >= open) return cur >= open && cur <= close
  return cur >= open || cur <= close
}

/** Count trading days in the inclusive ['YYYY-MM-DD', 'YYYY-MM-DD'] date range. Used as the
 *  denominator for per-trading-day averages. Returns 0 if the range is inverted. */
export function countTradingDays(
  hours: BusinessHours | null | undefined,
  from: string,
  to: string,
): number {
  const start = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return 0
  let count = 0
  for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    if (isTradingDay(hours, WEEKDAY_BY_INDEX[d.getUTCDay()]!)) count++
  }
  return count
}
