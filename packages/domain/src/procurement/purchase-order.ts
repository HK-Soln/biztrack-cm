// ---------------------------------------------------------------------------
// A purchase order's money: each line is quantity × unit price, the order total is their
// sum, in whole francs. One rule for the API, the till, the order document and the order
// form, which each used to multiply it out themselves.
// ---------------------------------------------------------------------------

import { toWholeXaf } from '../money/whole-xaf'

export interface PricedOrderLine {
  quantity: number
  unitPrice: number
  lineTotal: number
}

export function priceOrderLines<L extends { quantity: number; unitPrice?: number | null }>(
  lines: ReadonlyArray<L>,
): { lines: Array<L & PricedOrderLine>; total: number } {
  const priced = lines.map((line) => {
    const quantity = Number(line.quantity) || 0
    const unitPrice = Number(line.unitPrice ?? 0) || 0
    return { ...line, quantity, unitPrice, lineTotal: toWholeXaf(quantity * unitPrice) }
  })
  return { lines: priced, total: toWholeXaf(priced.reduce((sum, l) => sum + l.lineTotal, 0)) }
}

export type PurchaseOrderRejection =
  | 'PO_ITEMS_REQUIRED'
  /** A line has no quantity above zero. */
  | 'PO_ITEM_QTY_INVALID'
  /** The order is worth nothing. */
  | 'PO_TOTAL_ZERO'

/** What an order needs before it can be saved: lines, each with a quantity, worth something. */
export function checkPurchaseOrder(
  lines: ReadonlyArray<{ quantity: number; unitPrice?: number | null }>,
): PurchaseOrderRejection | null {
  if (lines.length === 0) return 'PO_ITEMS_REQUIRED'
  if (lines.some((line) => !Number.isFinite(line.quantity) || line.quantity <= 0)) {
    return 'PO_ITEM_QTY_INVALID'
  }
  if (priceOrderLines(lines).total <= 0) return 'PO_TOTAL_ZERO'
  return null
}
