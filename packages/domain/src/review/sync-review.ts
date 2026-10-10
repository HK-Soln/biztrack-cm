// ---------------------------------------------------------------------------
// Review of what an offline till did. A sale or refund that syncs up already
// happened: the goods and the cash moved. The server records it as it happened and
// raises a flag for the owner where its own view disagrees; it never rejects or
// rewrites the fact. These functions decide which flags to raise and how serious
// each one is (rulings R1 and R3 in docs/design/domain-package.md).
// ---------------------------------------------------------------------------

import { ReviewFlagCode, ReviewFlagSeverity, type ReviewFlagDraft } from '@biztrack/types'
import { toWholeXaf } from '../money/whole-xaf'

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
