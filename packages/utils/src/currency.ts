// ---------------------------------------------------------------------------
// Integer-XAF money helpers (the single source of truth for money rounding).
//
// XAF is a zero-decimal currency: no sub-unit value is ever meaningful or stored.
// Every money computation (line totals, discount allocation, expected cash) must
// round through `toWholeXaf`. Formatting (`formatCurrency`) is display-only and
// must never feed back into calculation.
// ---------------------------------------------------------------------------

/** Cash-denomination rounding step, in whole XAF. `1` means no cash snapping. */
export type CashRoundingUnit = 1 | 5 | 25 | 50 | 100

/**
 * Round a computed amount to a whole number of XAF, half away from zero
 * (so 2.5 → 3 and -2.5 → -3). This is the ONLY rounding used inside money
 * computation. A magnitude-relative epsilon absorbs IEEE-754 drift so a value
 * that is mathematically x.5 never rounds down because it was stored as
 * x.4999999999. Non-finite input yields 0.
 */
export function toWholeXaf(amount: number): number {
  if (!Number.isFinite(amount)) return 0
  const abs = Math.abs(amount)
  const eps = (abs + 1) * 1e-9
  return Math.sign(amount) * Math.round(abs + eps)
}

/**
 * Snap an amount to the nearest multiple of `unit` XAF (half away from zero).
 * Used ONLY by the ROUNDING / cadeau discount path — ordinary totals always use
 * `toWholeXaf` (unit 1). Default `unit` is 1 (decision D10), i.e. plain whole XAF.
 */
export function roundToCashUnit(amount: number, unit: CashRoundingUnit = 1): number {
  if (unit === 1) return toWholeXaf(amount)
  return toWholeXaf(amount / unit) * unit
}

export function formatCurrency(amount: number, currency = 'XAF', locale = 'fr-CM'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: currency === 'XAF' ? 0 : 2,
    maximumFractionDigits: currency === 'XAF' ? 0 : 2,
  }).format(amount)
}

export function parseCurrency(value: string): number {
  return parseFloat(value.replace(/[^0-9.-]/g, ''))
}

export function calculateProfit(revenue: number, expenses: number): number {
  return revenue - expenses
}

export function calculateMargin(costPrice: number, sellingPrice: number): number {
  if (costPrice === 0) return 0
  return ((sellingPrice - costPrice) / sellingPrice) * 100
}
