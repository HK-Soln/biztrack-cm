// ---------------------------------------------------------------------------
// The income statement for a period: revenue less the cost of what was sold is the gross
// profit; other income in, expenses out, is the net profit. Revenue and cost are already
// net of refunds (ruling R4, `netSalesProfit`). One rule for the API's P&L and the report
// builder both builds use.
// ---------------------------------------------------------------------------

import { toWholeXaf } from '../money/whole-xaf'
import { roundPercent } from './period-summary'

export interface IncomeStatement {
  revenue: number
  costOfGoods: number
  grossProfit: number
  /** Gross profit as a percentage of revenue, one decimal; 0 with no revenue. */
  grossMarginPercent: number
  otherIncome: number
  totalExpenses: number
  netProfit: number
  /** Net profit as a percentage of revenue, one decimal; 0 with no revenue. */
  netMarginPercent: number
}

export function incomeStatement(input: {
  revenue: number
  costOfGoods: number
  otherIncome?: number | null
  totalExpenses?: number | null
}): IncomeStatement {
  const revenue = toWholeXaf(input.revenue)
  const costOfGoods = toWholeXaf(input.costOfGoods)
  const otherIncome = toWholeXaf(input.otherIncome ?? 0)
  const totalExpenses = toWholeXaf(input.totalExpenses ?? 0)
  const grossProfit = toWholeXaf(revenue - costOfGoods)
  const netProfit = toWholeXaf(grossProfit + otherIncome - totalExpenses)
  return {
    revenue,
    costOfGoods,
    grossProfit,
    grossMarginPercent: revenue > 0 ? roundPercent((grossProfit / revenue) * 100) : 0,
    otherIncome,
    totalExpenses,
    netProfit,
    netMarginPercent: revenue > 0 ? roundPercent((netProfit / revenue) * 100) : 0,
  }
}
