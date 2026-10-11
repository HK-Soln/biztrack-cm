// ---------------------------------------------------------------------------
// Review of what an offline till did. A sale or refund that syncs up already
// happened: the goods and the cash moved. The server records it as it happened and
// raises a flag for the owner where its own view disagrees; it never rejects or
// rewrites the fact. These functions decide which flags to raise and how serious
// each one is (rulings R1, R2 and R3 in docs/design/domain-package.md).
// ---------------------------------------------------------------------------

import { ReviewFlagCode, ReviewFlagSeverity, type ReviewFlagDraft } from '@biztrack/types'
import { toWholeXaf } from '../money/whole-xaf'
import {
  discountNeedsAuthorization,
  evaluateDiscountAuthorization,
  type DiscountEvaluationInput,
  type RoleDiscountPolicyVersion,
} from '../sales/discount-policy'

/**
 * Ruling R1 — a refund synced from a till. The till's amount is recorded as it is; this
 * decides the flags.
 *  - More than was paid on the sale → HIGH: a typo or theft, the owner sees it first.
 *  - Otherwise more than the returned goods are worth → MEDIUM.
 *  - The till's lines could not be applied as sent (unknown line, or more than is left
 *    of a line) → MEDIUM.
 */
export function reviewSyncedRefund(input: {
  saleId: string
  returnId: string
  /** The money the till handed back. */
  tillRefundAmount: number
  /** What the sale had been paid before this refund. */
  amountPaid: number
  /** The server's value of the goods it could apply as returned. */
  goodsValue: number
  /** Quantity the till returned in total, and the quantity the server could apply. */
  tillQuantity: number
  appliedQuantity: number
  /** Return lines pointing at items that are not on the sale. */
  unknownLineCount: number
  outletId?: string | null
}): ReviewFlagDraft[] {
  const flags: ReviewFlagDraft[] = []
  const till = toWholeXaf(input.tillRefundAmount)
  const base = {
    entityType: 'sale' as const,
    entityId: input.saleId,
    outletId: input.outletId ?? null,
  }

  if (till > input.amountPaid) {
    flags.push({
      ...base,
      code: ReviewFlagCode.REFUND_EXCEEDS_PAID,
      severity: ReviewFlagSeverity.HIGH,
      dedupeKey: `${input.returnId}:exceeds-paid`,
      details: {
        returnId: input.returnId,
        refundAmount: till,
        amountPaid: input.amountPaid,
        excess: toWholeXaf(till - input.amountPaid),
      },
    })
  } else if (till > input.goodsValue) {
    flags.push({
      ...base,
      code: ReviewFlagCode.REFUND_AMOUNT_MISMATCH,
      severity: ReviewFlagSeverity.MEDIUM,
      dedupeKey: `${input.returnId}:amount`,
      details: {
        returnId: input.returnId,
        refundAmount: till,
        goodsValue: input.goodsValue,
        excess: toWholeXaf(till - input.goodsValue),
      },
    })
  }

  if (input.unknownLineCount > 0 || input.appliedQuantity < input.tillQuantity) {
    flags.push({
      ...base,
      code: ReviewFlagCode.REFUND_QUANTITY_MISMATCH,
      severity: ReviewFlagSeverity.MEDIUM,
      dedupeKey: `${input.returnId}:quantity`,
      details: {
        returnId: input.returnId,
        tillQuantity: input.tillQuantity,
        appliedQuantity: input.appliedQuantity,
        unknownLineCount: input.unknownLineCount,
      },
    })
  }

  return flags
}

/**
 * Ruling R3 — a synced sale took stock the server does not have. The sale stands and the
 * level goes negative; the owner gets one flag per product (and variant) that went below
 * zero. Returns null when the level stays at or above zero.
 */
export function reviewStockAfterSyncedSale(input: {
  saleId: string
  productId: string
  variantId?: string | null
  productName?: string | null
  /** Stock on hand before this sale's deduction. */
  available: number
  requested: number
  outletId?: string | null
}): ReviewFlagDraft | null {
  const after = input.available - input.requested
  if (after >= 0) return null
  return {
    code: ReviewFlagCode.NEGATIVE_STOCK,
    severity: ReviewFlagSeverity.MEDIUM,
    entityType: 'sale',
    entityId: input.saleId,
    dedupeKey: `${input.saleId}:stock:${input.productId}:${input.variantId ?? ''}`,
    outletId: input.outletId ?? null,
    details: {
      productId: input.productId,
      variantId: input.variantId ?? null,
      productName: input.productName ?? null,
      available: input.available,
      requested: input.requested,
      shortfall: -after,
    },
  }
}

/**
 * Ruling R3 — a synced sale sold a serial unit that another sale already took. Both sales
 * stand; the unit stays with the sale that has it. HIGH: one physical unit cannot be sold
 * twice, so one of the two records is wrong.
 */
export function reviewSerialAlreadySold(input: {
  saleId: string
  serialUnitId: string
  serialNumber?: string | null
  /** The sale the unit is already recorded against, when known. */
  soldOnSaleId?: string | null
  outletId?: string | null
}): ReviewFlagDraft {
  return {
    code: ReviewFlagCode.SERIAL_ALREADY_SOLD,
    severity: ReviewFlagSeverity.HIGH,
    entityType: 'sale',
    entityId: input.saleId,
    dedupeKey: `${input.saleId}:serial:${input.serialUnitId}`,
    outletId: input.outletId ?? null,
    details: {
      serialUnitId: input.serialUnitId,
      serialNumber: input.serialNumber ?? null,
      soldOnSaleId: input.soldOnSaleId ?? null,
    },
  }
}

/** Why a synced sale's discount is flagged. */
export type SyncedDiscountFinding =
  /** Over the cashier's limits in force at the time, with no manager approval. */
  | 'OVER_LIMIT'
  /** A manager approved it, but it was over that manager's own limits too. */
  | 'APPROVER_LIMIT'
  /** Within the limits the till still had; the limits had changed and not reached it. */
  | 'TILL_OLD_LIMITS'

/**
 * Ruling R2 — the discount on a sale synced from a till. The till decided offline whether
 * the discount needed a manager; the server decides again with the limits in force when the
 * sale was made, and flags the sale where it disagrees. The sale itself always stands.
 *
 *  - No history of the cashier's limits at the time of the sale → the till's verdict stands.
 *  - The till itself recorded the discount as unauthorized → nothing to add.
 *  - A manager approved it → flagged (MEDIUM) only when it was over that manager's own
 *    limits; with no history for the manager, the approval stands.
 *  - Nobody approved it and it was over the limits → MEDIUM, unless it was within the
 *    limits the till still had, which is LOW: nobody did anything wrong, the till was
 *    behind.
 */
export function reviewSyncedDiscount(input: {
  saleId: string
  discount: DiscountEvaluationInput
  /** A line was sold below its cost. */
  belowCost: boolean
  /** What the till recorded on the sale's discount rows. */
  till: { unauthorized: boolean; authorizedBy: string | null }
  /** The cashier's policy in force when the sale was made; null when there is no history. */
  cashierPolicy: RoleDiscountPolicyVersion | null
  /** The policy the till used, when it is known and is not the one in force. */
  tillPolicy?: RoleDiscountPolicyVersion | null
  /** The approving manager's policy in force when the sale was made. */
  approverPolicy?: RoleDiscountPolicyVersion | null
  outletId?: string | null
}): ReviewFlagDraft | null {
  const { cashierPolicy, tillPolicy, approverPolicy } = input
  if (!cashierPolicy) return null
  const need = discountNeedsAuthorization(cashierPolicy, input.discount, input.belowCost)
  if (!need.needsAuthorization) return null
  if (input.till.unauthorized) return null

  let finding: SyncedDiscountFinding
  let failed: RoleDiscountPolicyVersion = cashierPolicy
  let reasons: string[] = [...need.reasons, ...(need.belowCostBlocked ? ['BELOW_COST'] : [])]

  if (input.till.authorizedBy) {
    if (!approverPolicy) return null
    const approver = evaluateDiscountAuthorization(approverPolicy, input.discount)
    if (!approver.overLimit) return null
    finding = 'APPROVER_LIMIT'
    failed = approverPolicy
    reasons = [...approver.reasons]
  } else if (
    tillPolicy &&
    tillPolicy.version !== cashierPolicy.version &&
    !discountNeedsAuthorization(tillPolicy, input.discount, input.belowCost).needsAuthorization
  ) {
    finding = 'TILL_OLD_LIMITS'
  } else {
    finding = 'OVER_LIMIT'
  }

  const lineDiscounts = input.discount.lines.reduce((sum, line) => sum + line.discountAmount, 0)
  return {
    code: ReviewFlagCode.DISCOUNT_UNAUTHORIZED,
    severity: finding === 'TILL_OLD_LIMITS' ? ReviewFlagSeverity.LOW : ReviewFlagSeverity.MEDIUM,
    entityType: 'sale',
    entityId: input.saleId,
    dedupeKey: `${input.saleId}:discount`,
    outletId: input.outletId ?? null,
    details: {
      reason: finding,
      exceeded: reasons,
      discountTotal: toWholeXaf(input.discount.cartDiscount + lineDiscounts),
      subtotal: toWholeXaf(input.discount.subtotal),
      maxDiscountPercent: failed.maxDiscountPercent,
      maxCartDiscountPercent: failed.maxCartDiscountPercent,
      maxDiscountAmountXaf: failed.maxDiscountAmountXaf,
      limitsVersion: cashierPolicy.version,
      tillLimitsVersion: tillPolicy?.version ?? null,
      authorizedBy: input.till.authorizedBy,
    },
  }
}
