/**
 * dateUtils.ts  — BizTrack local-date helpers
 *
 * ─── DEVELOPER MEMO ────────────────────────────────────────────────────────
 *
 * NEVER use `new Date().toISOString().slice(0, 10)` or `.slice(0, 7)` to build
 * a "today" or "this month" key.  toISOString() returns a UTC timestamp:
 * users in WAT (UTC+1), EAT (UTC+3) etc. will see the PREVIOUS day's date
 * for the first hour of every day, causing revenue figures, expense totals
 * and monthly reports to silently show wrong data.
 *
 * ALWAYS derive local date parts from getFullYear() / getMonth() / getDate().
 * This file provides typed helpers — use them everywhere.
 *
 * ─── RULE ──────────────────────────────────────────────────────────────────
 *  ✅ localDateStr()         → "YYYY-MM-DD"  (local timezone)
 *  ✅ localMonthStr()        → "YYYY-MM"     (local timezone)
 *  ✅ localMonthStrFromDate() → "YYYY-MM"    from an arbitrary Date
 *  ❌ new Date().toISOString().slice(0,10)   — FORBIDDEN for display/filtering
 *
 * ───────────────────────────────────────────────────────────────────────────
 */

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * Returns today's date as a "YYYY-MM-DD" string in the device's local timezone.
 * Safe to compare against `expense.date` (stored as local YYYY-MM-DD) and
 * against `sale.createdAt.slice(0, 10)` (stored as UTC ISO, same digits for
 * WAT/UTC+1 except in the first hour after midnight — acceptable trade-off since
 * sales are written synchronously and read immediately).
 */
export function localDateStr(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * Returns the current month as a "YYYY-MM" string in the device's local timezone.
 * Use this everywhere you slice a date for monthly grouping/filtering.
 */
export function localMonthStr(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
}

/**
 * Derives a "YYYY-MM" string from any Date in local time.
 * Useful when iterating over a date series for chart labels etc.
 */
export function localMonthStrFromDate(date: Date): string {
  return localMonthStr(date)
}
