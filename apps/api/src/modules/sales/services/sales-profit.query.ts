import type { EntityManager } from 'typeorm'
import {
  netSalesProfit,
  PROFIT_SALE_STATUSES,
  refundProfitImpact,
  sumRefundProfitImpacts,
  type RefundProfitImpact,
} from '@biztrack/domain'

interface ReturnedLineRow {
  return_id: string
  restock: boolean
  returned_quantity: string | number
  sold_quantity: string | number
  line_total: string | number
  cost_price: string | number | null
}

/** Turn the returned lines of one or more returns into what they take off profit. */
export function refundImpactFromRows(rows: ReturnedLineRow[]): RefundProfitImpact {
  const byReturn = new Map<string, ReturnedLineRow[]>()
  for (const row of rows) {
    const lines = byReturn.get(row.return_id) ?? []
    lines.push(row)
    byReturn.set(row.return_id, lines)
  }
  return sumRefundProfitImpacts(
    [...byReturn.values()].map((lines) =>
      refundProfitImpact({
        restock: Boolean(lines[0]?.restock),
        lines: lines.map((line) => ({
          returnedQuantity: Number(line.returned_quantity),
          soldQuantity: Number(line.sold_quantity),
          lineTotal: Number(line.line_total),
          costPrice: line.cost_price === null ? null : Number(line.cost_price),
        })),
      }),
    ),
  )
}

/**
 * Revenue and cost of goods for a period, on the financial grain (posting date) — the
 * figures the Income Statement shows. The rule is @biztrack/domain's (ruling R4): what was
 * sold in the period, less the refunds made in the period. This is the only place the API
 * loads them, so the gross-profit endpoint and the P&L summary cannot disagree.
 * `dateFrom` / `dateTo` are inclusive 'YYYY-MM-DD' days.
 */
export async function loadNetSalesProfit(
  manager: EntityManager,
  businessId: string,
  range: { dateFrom?: string; dateTo?: string },
): Promise<{ revenue: number; cogs: number; refundedRevenue: number }> {
  const saleDay = 'COALESCE(s.posting_date, s.business_date, s.sale_date)'
  // A return has no posting date of its own yet: its business date when stamped, else the
  // UTC day it was recorded.
  const returnDay = `COALESCE(r.business_date, (r.created_at AT TIME ZONE 'UTC')::date)`

  const params: unknown[] = [businessId]
  const saleConds: string[] = []
  const returnConds: string[] = []
  if (range.dateFrom) {
    params.push(range.dateFrom)
    saleConds.push(`${saleDay} >= $${params.length}`)
    returnConds.push(`${returnDay} >= $${params.length}`)
  }
  if (range.dateTo) {
    params.push(range.dateTo)
    saleConds.push(`${saleDay} <= $${params.length}`)
    returnConds.push(`${returnDay} <= $${params.length}`)
  }
  const and = (conds: string[]) => (conds.length ? ` AND ${conds.join(' AND ')}` : '')
  const statuses = PROFIT_SALE_STATUSES.map((status) => `'${status}'`).join(', ')

  const [sold] = (await manager.query(
    `SELECT COALESCE(SUM(si.line_total), 0) AS revenue,
            COALESCE(SUM(COALESCE(si.cost_price, 0) * si.quantity), 0) AS cogs
       FROM sale_items si JOIN sales s ON s.id = si.sale_id
      WHERE s.business_id = $1 AND s.deleted_at IS NULL AND si.deleted_at IS NULL
        AND s.status IN (${statuses})${and(saleConds)}`,
    params,
  )) as Array<{ revenue: string | number | null; cogs: string | number | null }>

  const returnedRows = (await manager.query(
    `SELECT r.id AS return_id, r.restock AS restock, ri.quantity AS returned_quantity,
            si.quantity AS sold_quantity, si.line_total AS line_total, si.cost_price AS cost_price
       FROM sale_return_items ri
       JOIN sale_returns r ON r.id = ri.sale_return_id
       JOIN sale_items si ON si.id = ri.sale_item_id
       JOIN sales s ON s.id = r.sale_id
      WHERE r.business_id = $1 AND s.deleted_at IS NULL
        AND s.status <> 'VOIDED'${and(returnConds)}`,
    params,
  )) as ReturnedLineRow[]

  const refunds = refundImpactFromRows(returnedRows)
  const net = netSalesProfit({
    soldRevenue: Number(sold?.revenue ?? 0),
    soldCogs: Number(sold?.cogs ?? 0),
    refunds,
  })
  return { revenue: net.revenue, cogs: net.cogs, refundedRevenue: refunds.revenue }
}
