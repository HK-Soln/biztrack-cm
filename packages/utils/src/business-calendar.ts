// BIZ-5.1 — the business calendar primitive: which local trading day a transaction belongs
// to. Shared by API + desktop so both stamp `business_date` identically by construction.
//
// A transaction's business_date is the local calendar date in the business timezone, shifted
// back by the day-cutover so a late-night trade counts to the previous trading day:
//   cutover 00:00 (default) → business_date = local calendar date (ordinary retail).
//   cutover 03:00 → a 01:00 sale falls on the *previous* day; a 05:00 sale on the current day.

export const DEFAULT_BUSINESS_TIMEZONE = 'Africa/Douala'
export const DEFAULT_DAY_CUTOVER = '00:00'

/** Parse an 'HH:mm' cutover into minutes-since-midnight (0–1439). Invalid → 0 (local midnight). */
export function parseCutoverMinutes(cutover: string | null | undefined): number {
  if (!cutover) return 0
  const m = /^(\d{1,2}):(\d{2})$/.exec(cutover.trim())
  if (!m) return 0
  const hours = Number(m[1])
  const minutes = Number(m[2])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return 0
  return hours * 60 + minutes
}

/** Normalize a cutover input to a valid zero-padded 'HH:mm', defaulting to 00:00 on invalid. */
export function normalizeDayCutover(value: string | null | undefined): string {
  const minutes = parseCutoverMinutes(value)
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

/** The local calendar date ('YYYY-MM-DD') of `instant` in the given IANA timezone. Falls back
 *  to the runtime's local date if the zone is missing or invalid. */
export function localDateInTimezone(
  instant: Date,
  timezone: string | null | undefined = DEFAULT_BUSINESS_TIMEZONE,
): string {
  try {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || DEFAULT_BUSINESS_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(instant)
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(instant)
  }
}

export interface BusinessDateOptions {
  /** IANA timezone; defaults to Africa/Douala. */
  timezone?: string | null
  /** Day-cutover as 'HH:mm'; defaults to 00:00 (local calendar date). */
  cutover?: string | null
}

/**
 * The business_date ('YYYY-MM-DD') for a transaction that happened at `instant`, in the
 * business's timezone and cutover. Stamp this at write time; never recompute at read (the
 * cutover is a mutable setting, so recomputing would silently re-bucket history).
 */
export function computeBusinessDate(
  instant: Date | string | number,
  options: BusinessDateOptions = {},
): string {
  const at = instant instanceof Date ? instant : new Date(instant)
  const cutoverMinutes = parseCutoverMinutes(options.cutover ?? DEFAULT_DAY_CUTOVER)
  // Shift the instant back by the cutover, then take the local date: a time before the cutover
  // lands on the previous local day.
  const shifted = new Date(at.getTime() - cutoverMinutes * 60_000)
  return localDateInTimezone(shifted, options.timezone ?? DEFAULT_BUSINESS_TIMEZONE)
}
