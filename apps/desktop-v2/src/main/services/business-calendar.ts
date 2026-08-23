import { computeBusinessDate, type BusinessDateOptions } from '@biztrack/utils'

/**
 * BIZ-5.1 — the local trading day for a desktop-written transaction. The business timezone +
 * cutover are not cached offline yet (they live on `businesses`, not the thin `local_businesses`
 * login cache — slice 3 will carry them), so this defaults to Africa/Douala + 00:00, i.e. the
 * local calendar date. That is correct for ordinary daytime retail; the API recomputes the
 * authoritative value on sync-apply for any business with a non-default cutover.
 *
 * A transaction rung inside an open shift should inherit that shift's business_date instead of
 * calling this (so a shift straddling midnight keeps one day) — the callers do that lookup.
 */
export function localBusinessDate(
  instant: Date | string | number = new Date(),
  options: BusinessDateOptions = {},
): string {
  return computeBusinessDate(instant, options)
}
