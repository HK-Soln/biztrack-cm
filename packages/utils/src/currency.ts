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

/**
 * Distribute a whole-XAF `total` across lines in proportion to `weights`, returning
 * a whole-XAF amount per line whose sum is EXACTLY `total`. Each share is rounded to
 * whole XAF and the rounding remainder is given to the largest-weight line, so no
 * sub-unit is lost or invented (used to allocate a cart-level discount across sale
 * lines — BIZ-1.3). Non-positive weights get 0; a zero total or all-zero weights
 * yields all zeros.
 */
export function allocateProRata(total: number, weights: number[]): number[] {
  const n = weights.length
  if (n === 0) return []
  const whole = toWholeXaf(total)
  const weight = weights.map((w) => (w > 0 ? w : 0))
  const totalWeight = weight.reduce((sum, w) => sum + w, 0)
  if (whole === 0 || totalWeight <= 0) return weight.map(() => 0)

  const alloc = weight.map((w) => toWholeXaf((whole * w) / totalWeight))
  const remainder = whole - alloc.reduce((sum, a) => sum + a, 0)

  // Give the rounding remainder to the largest-weight line so the sum is exact.
  let maxIdx = 0
  let maxWeight = weight[0] ?? 0
  for (let i = 1; i < n; i++) {
    const w = weight[i] ?? 0
    if (w > maxWeight) {
      maxWeight = w
      maxIdx = i
    }
  }
  alloc[maxIdx] = (alloc[maxIdx] ?? 0) + remainder
  return alloc
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
