import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { DebtDirection } from '@biztrack/types'
import { DailySaleSummary } from '@/entities/daily-sale-summary.entity'
import { SalesService } from '@/modules/sales/services/sales.service'
import { CashSessionsService } from '@/modules/cash-sessions/services/cash-sessions.service'
import { InventoryService } from '@/modules/inventory/services/inventory.service'
import { OpeningBalancesService } from '@/modules/debts/services/opening-balances.service'

/** The owner's end-of-day recap numbers for one business + one business-local day. */
export interface DailyDigestFigures {
  /** Σ sale_items.line_total for COMPLETED sales (Income-Statement revenue basis, D7). */
  revenue: number
  /** revenue − COGS (D7). */
  profit: number
  /** Total discounts given (from the canonical daily_sale_summaries row). */
  discounts: number
  /** Closed+open cash shifts on the day (0 → "no drawer closed"). */
  cashShifts: number
  /** Net counted-vs-expected cash variance across the day's shifts. */
  cashVariance: number
  /** Products currently at/below their reorder threshold. */
  lowStock: number
  /** Total receivables outstanding (all ages, incl. opening balances). */
  receivablesOutstanding: number
  /** Receivables past their due window (> 30 days). */
  receivablesOverdue: number
}

/**
 * Computes the daily-summary figures from the SAME canonical services the reports use,
 * so the digest never disagrees with what the owner sees on screen:
 *  - revenue/profit via SalesService.getGrossProfit (Income-Statement basis, D7)
 *  - cash variance via CashSessionsService.dailyReport
 *  - low-stock via InventoryService.getStats
 *  - receivables via OpeningBalancesService.getAgeingReport
 *  - discounts from the daily_sale_summaries row
 *
 * The day is identified by a business-local 'YYYY-MM-DD' key. Sales/summaries are
 * UTC-dated; because the digest fires near closing time the local and UTC dates
 * coincide for the sale window, matching the reports' UTC-day basis.
 */
@Injectable()
export class DailyDigestService {
  constructor(
    private readonly sales: SalesService,
    private readonly cashSessions: CashSessionsService,
    private readonly inventory: InventoryService,
    private readonly openingBalances: OpeningBalancesService,
    @InjectRepository(DailySaleSummary)
    private readonly summaryRepo: Repository<DailySaleSummary>,
  ) {}

  async computeFigures(businessId: string, dayKey: string): Promise<DailyDigestFigures> {
    const dayStart = `${dayKey}T00:00:00.000Z`
    const dayEnd = new Date(new Date(dayStart).getTime() + 86_400_000).toISOString()

    const [gp, cash, stats, ageing, summary] = await Promise.all([
      this.sales.getGrossProfit(businessId, { dateFrom: dayKey, dateTo: dayKey }),
      this.cashSessions.dailyReport(businessId, { fromIso: dayStart, toIso: dayEnd }),
      this.inventory.getStats(businessId),
      this.openingBalances.getAgeingReport(businessId, DebtDirection.RECEIVABLE),
      this.summaryRepo.findOne({ where: { businessId, summaryDate: dayKey } }),
    ])

    return {
      revenue: gp.revenue,
      profit: gp.revenue - gp.cogs,
      discounts: summary?.totalDiscounts ?? 0,
      cashShifts: cash.totals.shifts,
      cashVariance: cash.totals.varianceCash,
      lowStock: stats.lowStock,
      receivablesOutstanding: ageing.totals.totalOutstanding,
      receivablesOverdue: ageing.totals.overdue,
    }
  }
}
