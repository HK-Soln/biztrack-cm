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

/**
 * True when any line is sold below its cost. A null cost is skipped silently (many
 * catalogue items have no cost history). The caller (API / desktop main, never the
 * renderer — cost must not reach a cashier) combines this with the role's
 * allowBelowCost flag to decide whether manager authorization is required.
 */
export function isBelowCost(
  lines: Array<{ chargedUnitPrice: number; cost: number | null | undefined }>,
): boolean {
  return lines.some((l) => l.cost != null && l.chargedUnitPrice < l.cost)
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

/** Everything on a role that decides whether a discount needs a manager. */
export interface RoleDiscountPolicy extends RoleDiscountLimits {
  /** The role may sell below cost without a manager. */
  allowBelowCost: boolean
}

/** A role's discount policy as it stood at some moment (ruling R2). */
export interface RoleDiscountPolicyVersion extends RoleDiscountPolicy {
  /** Counts up from 1 each time the role's policy changes. */
  version: number
}

export const NO_DISCOUNT_POLICY: RoleDiscountPolicy = {
  maxDiscountPercent: null,
  maxCartDiscountPercent: null,
  maxDiscountAmountXaf: null,
  allowBelowCost: false,
}

export interface DiscountAuthorizationNeed extends DiscountEvaluation {
  /** A manager has to authorize: a limit is exceeded, or a line is below cost and the role
   * may not sell below cost. */
  needsAuthorization: boolean
  /** The below-cost rule is what (or part of what) requires the manager. */
  belowCostBlocked: boolean
}

/**
 * Whether a sale's discounts need a manager under a role's policy. The one rule the API
 * (REST and the re-check of synced sales) and the till both apply.
 */
export function discountNeedsAuthorization(
  policy: RoleDiscountPolicy,
  input: DiscountEvaluationInput,
  belowCost: boolean,
): DiscountAuthorizationNeed {
  const evaluation = evaluateDiscountAuthorization(policy, input)
  const belowCostBlocked = belowCost && !policy.allowBelowCost
  return {
    ...evaluation,
    belowCostBlocked,
    needsAuthorization: evaluation.overLimit || belowCostBlocked,
  }
}

/** True when two policies would decide every discount the same way. A change that leaves
 * this true does not start a new version of the role's policy. */
export function sameDiscountPolicy(a: RoleDiscountPolicy, b: RoleDiscountPolicy): boolean {
  const same = (x: number | null, y: number | null): boolean =>
    x == null || y == null ? x == null && y == null : Number(x) === Number(y)
  return (
    same(a.maxDiscountPercent, b.maxDiscountPercent) &&
    same(a.maxCartDiscountPercent, b.maxCartDiscountPercent) &&
    same(a.maxDiscountAmountXaf, b.maxDiscountAmountXaf) &&
    !!a.allowBelowCost === !!b.allowBelowCost
  )
}
