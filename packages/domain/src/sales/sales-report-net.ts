// ---------------------------------------------------------------------------
// Sales reports net of refunds (ruling R19). Every sales report counts a refunded or partly
// refunded sale the way the Income Statement does (ruling R4): in full on the day it was
// sold, with each refund taken off on the day of the refund, at the value actually charged
// for the returned goods. A voided sale never counts as sold.
//
// The adapters load what was sold in the period (PROFIT_SALE_STATUSES), the voided sales and
// the returned lines of the returns made in the period; these functions net them.
// ---------------------------------------------------------------------------

import type {
  CashierPerformanceRow,
  DailySalesRow,
  RefundCashierRow,
  RefundReasonRow,
} from '@biztrack/types'
import { toWholeXaf } from '../money/whole-xaf'
import { refundProfitImpact, type ReturnedLineForProfit } from './sale-profit'

/** One returned line of a return made in the period, with the key it is reported under. */
export interface ReportReturnLine extends ReturnedLineForProfit {
  returnId: string
  /** Whether that return put its goods back into stock. */
  restock: boolean
}

export interface ReturnTotals {
  /** Number of distinct returns. */
  returns: number
  /** Units returned. */
  quantity: number
  /** Value of the returned goods, as charged (ruling R4). */
  value: number
}

const NO_RETURNS: ReturnTotals = { returns: 0, quantity: 0, value: 0 }

/**
 * Totals of returned lines grouped under a key (a day, a cashier, a reason). Each return is
 * valued on its own, as the Income Statement values it.
 */
export function returnTotalsBy<L extends ReportReturnLine, K>(
  lines: ReadonlyArray<L>,
  keyOf: (line: L) => K,
): Map<K, ReturnTotals> {
  const groups = new Map<K, Map<string, L[]>>()
  for (const line of lines) {
    const key = keyOf(line)
    const byReturn = groups.get(key) ?? new Map<string, L[]>()
    byReturn.set(line.returnId, [...(byReturn.get(line.returnId) ?? []), line])
    groups.set(key, byReturn)
  }
  const totals = new Map<K, ReturnTotals>()
  for (const [key, byReturn] of groups) {
    let quantity = 0
    let value = 0
    for (const returnLines of byReturn.values()) {
      quantity += returnLines.reduce((sum, line) => sum + line.returnedQuantity, 0)
      value += refundProfitImpact({ restock: returnLines[0]!.restock, lines: returnLines }).revenue
    }
    totals.set(key, { returns: byReturn.size, quantity, value })
  }
  return totals
}

/** All the returned lines as one total. */
export function returnTotals(lines: ReadonlyArray<ReportReturnLine>): ReturnTotals {
  return returnTotalsBy(lines, () => 'all').get('all') ?? NO_RETURNS
}

export interface NetSalesSummary {
  revenue: number
  transactions: number
  averageBasket: number
  itemsSold: number
  /** Voided sales plus returns made in the period. */
  refundCount: number
  /** Voided totals plus the value of the goods returned in the period. */
  refundAmount: number
}

/**
 * The period summary (KPI strip): what was sold, less the period's returns. A refunded sale
 * is still a transaction of the day it was made. Voids and returns both count as refunds.
 */
export function netSalesSummary(input: {
  /** Σ total of the period's sales (PROFIT_SALE_STATUSES). */
  soldRevenue: number
  /** Number of those sales. */
  transactions: number
  /** Units on those sales. */
  soldUnits: number
  returns: ReturnTotals
  voids: { count: number; amount: number }
}): NetSalesSummary {
  const revenue = toWholeXaf(input.soldRevenue) - input.returns.value
  return {
    revenue,
    transactions: input.transactions,
    averageBasket: input.transactions > 0 ? toWholeXaf(revenue / input.transactions) : 0,
    itemsSold: input.soldUnits - input.returns.quantity,
    refundCount: input.voids.count + input.returns.returns,
    refundAmount: toWholeXaf(input.voids.amount) + input.returns.value,
  }
}

/** Money handed back on one day, by tender. */
export interface DailyRefundPayments {
  date: string
  cash: number
  momo: number
  card: number
}

/**
 * The daily sales series net of refunds. A day's total loses the goods returned that day and
 * each tender loses what was paid back in it that day. Credit is the sales' credit as it now
 * stands (a return reduces the debt first, ruling R10). A day with only refunds is listed.
 */
export function netDailySales(input: {
  sold: ReadonlyArray<DailySalesRow>
  /** Value of the goods returned, per day. */
  returns: ReadonlyMap<string, ReturnTotals>
  refundPayments: ReadonlyArray<DailyRefundPayments>
}): DailySalesRow[] {
  const rows = new Map<string, DailySalesRow>()
  const row = (date: string): DailySalesRow => {
    const existing = rows.get(date)
    if (existing) return existing
    const fresh = { date, transactions: 0, total: 0, cash: 0, momo: 0, card: 0, credit: 0 }
    rows.set(date, fresh)
    return fresh
  }
  for (const day of input.sold) {
    rows.set(day.date, {
      date: day.date,
      transactions: day.transactions,
      total: toWholeXaf(day.total),
      cash: toWholeXaf(day.cash),
      momo: toWholeXaf(day.momo),
      card: toWholeXaf(day.card),
      credit: toWholeXaf(day.credit),
    })
  }
  for (const [date, returned] of input.returns) row(date).total -= returned.value
  for (const paid of input.refundPayments) {
    const day = row(paid.date)
    day.cash -= toWholeXaf(paid.cash)
    day.momo -= toWholeXaf(paid.momo)
    day.card -= toWholeXaf(paid.card)
  }
  return [...rows.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

/** A cashier's returns in the period, keyed to the cashier who made the sale. */
export interface CashierReturns extends ReturnTotals {
  cashierId: string
  name: string
}

/** Returned lines grouped under the cashier who made the sale. */
export function returnsByCashier(
  lines: ReadonlyArray<ReportReturnLine & { cashierId: string; cashierName: string | null }>,
): CashierReturns[] {
  const names = new Map(lines.map((line) => [line.cashierId, line.cashierName || '—']))
  return [...returnTotalsBy(lines, (line) => line.cashierId)].map(([cashierId, totals]) => ({
    cashierId,
    name: names.get(cashierId) ?? '—',
    ...totals,
  }))
}

/**
 * The cashier roster net of refunds. A return comes off the sales of the cashier who made the
 * sale and adds to that cashier's refunds, beside the voids. Sorted by sales, highest first.
 */
export function netCashierRoster(
  sold: ReadonlyArray<CashierPerformanceRow>,
  returns: ReadonlyArray<CashierReturns>,
): CashierPerformanceRow[] {
  const rows = new Map<string, CashierPerformanceRow>()
  for (const r of sold) {
    rows.set(r.cashierId, {
      ...r,
      sales: toWholeXaf(r.sales),
      refunds: toWholeXaf(r.refunds),
      discounts: toWholeXaf(r.discounts),
    })
  }
  for (const r of returns) {
    const row = rows.get(r.cashierId) ?? {
      cashierId: r.cashierId,
      name: r.name,
      shifts: 0,
      transactions: 0,
      sales: 0,
      refunds: 0,
      discounts: 0,
    }
    row.sales -= r.value
    row.refunds += r.value
    rows.set(r.cashierId, row)
  }
  return [...rows.values()].sort((a, b) => b.sales - a.sales)
}

/**
 * The refunds report: voids and the period's returns together, by reason and by cashier.
 * `grossSales` is what was sold in the period before refunds, the base of the refund rate.
 * Only cashiers with a refund are listed; both lists are sorted by amount, highest first.
 */
export function refundsReport(input: {
  voidsByReason: ReadonlyArray<RefundReasonRow>
  returnsByReason: ReadonlyMap<string | null, ReturnTotals>
  /** Per cashier: void totals and what they sold in the period (PROFIT_SALE_STATUSES). */
  voidsByCashier: ReadonlyArray<RefundCashierRow>
  returnsByCashier: ReadonlyArray<CashierReturns>
  grossSales: number
}): { byReason: RefundReasonRow[]; byCashier: RefundCashierRow[]; grossSales: number } {
  const reasons = new Map<string | null, RefundReasonRow>()
  for (const r of input.voidsByReason) {
    reasons.set(r.reason, { reason: r.reason, count: r.count, amount: toWholeXaf(r.amount) })
  }
  for (const [reason, returned] of input.returnsByReason) {
    const row = reasons.get(reason) ?? { reason, count: 0, amount: 0 }
    row.count += returned.returns
    row.amount += returned.value
    reasons.set(reason, row)
  }

  const cashiers = new Map<string, RefundCashierRow>()
  for (const r of input.voidsByCashier) {
    cashiers.set(r.cashierId, { ...r, refunds: toWholeXaf(r.refunds), sales: toWholeXaf(r.sales) })
  }
  for (const r of input.returnsByCashier) {
    const row = cashiers.get(r.cashierId) ?? {
      cashierId: r.cashierId,
      name: r.name,
      refunds: 0,
      sales: 0,
    }
    row.refunds += r.value
    cashiers.set(r.cashierId, row)
  }

  return {
    byReason: [...reasons.values()].sort((a, b) => b.amount - a.amount),
    byCashier: [...cashiers.values()]
      .filter((r) => r.refunds > 0)
      .sort((a, b) => b.refunds - a.refunds),
    grossSales: toWholeXaf(input.grossSales),
  }
}

/** Gross sales for the discount reports, net of the period's returns. */
export function netGrossSales(soldTotal: number, returns: ReturnTotals = NO_RETURNS): number {
  return toWholeXaf(soldTotal) - returns.value
}
