// ---------------------------------------------------------------------------
// Discount authorization policy (BIZ-1.4). A cashier's role carries optional
// discount limits; a discount beyond them still completes (APPROVE, never BLOCK)
// but is flagged `unauthorized` until a manager PIN authorizes it. This helper is
// the single source of truth for "is this discount over the limit", shared by the
// API, the desktop main process, and the renderer (to prompt step-up) so all three
// agree. null limit = no cap.
// ---------------------------------------------------------------------------

export interface RoleDiscountLimits {
  /** Max per-line discount as a % of that line's listed value; null = no limit. */
  maxDiscountPercent: number | null
  /** Max cart-level discount as a % of subtotal; null = no limit. */
  maxCartDiscountPercent: number | null
  /** Max total discount (all lines + cart) in whole XAF; null = no limit. */
  maxDiscountAmountXaf: number | null
}

export interface DiscountEvaluationInput {
  /** Per line: the discount charged on it and the line's listed value (listed × qty). */
  lines: Array<{ discountAmount: number; listedLineValue: number }>
  /** The cart-level discount amount (before pro-rata allocation). */
  cartDiscount: number
  /** Sum of line listed values — the base for the cart-discount %. */
  subtotal: number
}

export interface DiscountEvaluation {
  /** True when any limit is exceeded — the discount needs manager authorization. */
  overLimit: boolean
  /** Which limits were exceeded (for a precise UI message). */
  reasons: Array<'LINE_PERCENT' | 'CART_PERCENT' | 'TOTAL_AMOUNT'>
}

const pct = (part: number, whole: number): number => (whole > 0 ? (part / whole) * 100 : 0)

/**
 * Evaluate a sale's discounts against a role's limits. A null limit never triggers.
 * The percent and amount caps are independent — the stricter one wins simply because
 * exceeding ANY cap sets overLimit. A tiny epsilon absorbs float drift so a discount
 * exactly at the limit is allowed.
 */
export function evaluateDiscountAuthorization(
  limits: RoleDiscountLimits,
  input: DiscountEvaluationInput,
): DiscountEvaluation {
  const reasons: DiscountEvaluation['reasons'] = []
  const EPS = 1e-6

  if (limits.maxDiscountPercent != null) {
    const overLine = input.lines.some(
      (l) => pct(l.discountAmount, l.listedLineValue) > limits.maxDiscountPercent! + EPS,
    )
    if (overLine) reasons.push('LINE_PERCENT')
  }

  if (limits.maxCartDiscountPercent != null) {
    if (pct(input.cartDiscount, input.subtotal) > limits.maxCartDiscountPercent + EPS) {
      reasons.push('CART_PERCENT')
    }
  }

  if (limits.maxDiscountAmountXaf != null) {
    const totalDiscount =
      input.cartDiscount + input.lines.reduce((sum, l) => sum + l.discountAmount, 0)
    if (totalDiscount > limits.maxDiscountAmountXaf + EPS) reasons.push('TOTAL_AMOUNT')
  }

  return { overLimit: reasons.length > 0, reasons }
}
