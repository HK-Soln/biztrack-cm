// ---------------------------------------------------------------------------
// Profit from sales — the one definition used by the daily summary and the Income
// Statement (decision D7, ruling R4 in docs/design/domain-package.md).
//
//   revenue      = Σ line totals (after line and cart discounts, charges excluded)
//   cost of goods = Σ cost × quantity
//   A refund reduces the revenue of the day the refund happens by the value actually
//   charged for the returned goods, and gives back the cost of the items put back into
//   stock. Items not restocked keep their cost.
// ---------------------------------------------------------------------------

import { SaleStatus } from '@biztrack/types'
import { toWholeXaf } from '../money/whole-xaf'

/**
 * Sales that count toward revenue and cost of goods. A refunded or partially refunded sale
 * still counts in full on the day it was sold; its refund is subtracted separately on the
 * day of the refund. Voided sales never count.
 */
export const PROFIT_SALE_STATUSES: readonly SaleStatus[] = [
  SaleStatus.COMPLETED,
  SaleStatus.PARTIALLY_REFUNDED,
  SaleStatus.REFUNDED,
]

export interface ReturnedLineForProfit {
  /** Quantity returned on this return line. */
  returnedQuantity: number
  /** Quantity originally sold on the sale line. */
  soldQuantity: number
  /** The sale line's total after its line discount and cart-discount share. */
  lineTotal: number
  /** Unit cost recorded on the sale line; null when unknown. */
  costPrice: number | null | undefined
}

export interface RefundProfitImpact {
  /** Revenue to subtract: the value actually charged for the returned goods. */
  revenue: number
  /** Cost of goods to subtract: the cost of the items put back into stock. */
  cogs: number
  /** revenue − cogs: how much gross profit falls. */
  grossProfit: number
}

/**
 * What one return takes off revenue and cost of goods (ruling R4). Revenue is the
 * discounted per-unit price × the quantity returned, never the list price. Cost is reversed
 * only when the goods went back into stock; otherwise the business still bore it.
 */
export function refundProfitImpact(input: {
  /** Whether the returned goods were put back into stock. */
  restock: boolean
  lines: ReadonlyArray<ReturnedLineForProfit>
}): RefundProfitImpact {
  const revenue = toWholeXaf(
    input.lines.reduce((sum, line) => {
      const perUnit = line.soldQuantity > 0 ? line.lineTotal / line.soldQuantity : line.lineTotal
      return sum + perUnit * line.returnedQuantity
    }, 0),
  )
  const cogs = input.restock
    ? toWholeXaf(
        input.lines.reduce((sum, line) => sum + (line.costPrice ?? 0) * line.returnedQuantity, 0),
      )
    : 0
  return { revenue, cogs, grossProfit: revenue - cogs }
}

/** Sum several returns' impacts. */
export function sumRefundProfitImpacts(
  impacts: ReadonlyArray<RefundProfitImpact>,
): RefundProfitImpact {
  const revenue = impacts.reduce((sum, impact) => sum + impact.revenue, 0)
  const cogs = impacts.reduce((sum, impact) => sum + impact.cogs, 0)
  return { revenue, cogs, grossProfit: revenue - cogs }
}

/**
 * Net revenue and cost of goods for a period: what was sold in the period, less the refunds
 * made in the period.
 */
export function netSalesProfit(input: {
  /** Σ line totals of the period's sales (PROFIT_SALE_STATUSES). */
  soldRevenue: number
  /** Σ cost × quantity of the period's sales. */
  soldCogs: number
  /** The refunds made in the period. */
  refunds: RefundProfitImpact
}): { revenue: number; cogs: number; grossProfit: number } {
  const revenue = toWholeXaf(input.soldRevenue) - input.refunds.revenue
  const cogs = toWholeXaf(input.soldCogs) - input.refunds.cogs
  return { revenue, cogs, grossProfit: revenue - cogs }
}

export interface ProductSalesRow {
  productId: string
  name: string
  category: string | null
  quantity: number
  revenue: number
  cogs: number
}

export interface ReturnedProductLine extends ReturnedLineForProfit {
  returnId: string
  /** Whether that return put its goods back into stock. */
  restock: boolean
  productId: string
  name: string
  category: string | null
}

/**
 * Sales by product for a period, net of the period's refunds (ruling R4): each product's
 * quantity, revenue and cost of goods are what was sold in the period less what was
 * returned in it. A product with only refunds in the period shows as negative. Sorted by
 * revenue, highest first.
 */
export function netSalesByProduct(
  sold: ReadonlyArray<ProductSalesRow>,
  returned: ReadonlyArray<ReturnedProductLine>,
): ProductSalesRow[] {
  const rows = new Map<string, ProductSalesRow>()
  for (const row of sold) {
    rows.set(row.productId, {
      ...row,
      revenue: toWholeXaf(row.revenue),
      cogs: toWholeXaf(row.cogs),
    })
  }

  // One impact per (product, return), so each return's restock choice applies to its lines.
  const groups = new Map<string, ReturnedProductLine[]>()
  for (const line of returned) {
    const key = `${line.productId}\u0000${line.returnId}`
    groups.set(key, [...(groups.get(key) ?? []), line])
  }
  for (const lines of groups.values()) {
    const first = lines[0]!
    const impact = refundProfitImpact({ restock: first.restock, lines })
    const row = rows.get(first.productId) ?? {
      productId: first.productId,
      name: first.name,
      category: first.category,
      quantity: 0,
      revenue: 0,
      cogs: 0,
    }
    row.quantity -= lines.reduce((sum, line) => sum + line.returnedQuantity, 0)
    row.revenue -= impact.revenue
    row.cogs -= impact.cogs
    rows.set(first.productId, row)
  }

  return [...rows.values()].sort((a, b) => b.revenue - a.revenue)
}
