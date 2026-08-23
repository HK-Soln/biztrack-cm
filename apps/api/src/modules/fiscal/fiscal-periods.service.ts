import { Inject, Injectable, OnModuleInit } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, In, LessThan, Repository } from 'typeorm'
import { PeriodStatus } from '@biztrack/types'
import { LOGGER } from '@/logger/logger.module'
import type { Logger } from '@biztrack/logger'
import { AppBadRequestException, AppNotFoundException } from '@/common/exceptions/app-exceptions'
import { AccountingPeriod } from '@/entities/accounting-period.entity'
import { PeriodCloseRun } from '@/entities/period-close-run.entity'
import { PERIOD_CLOSE_STEPS, type PeriodCloseStep } from './period-close'

/**
 * BIZ-5.3 — the period close pipeline. Closing a period runs the (initially empty) registered
 * close steps idempotently, snapshots the period's figures, and flips OPEN → CLOSING → CLOSED.
 * Crash-safe: any period stuck in CLOSING on boot is recovered to OPEN and can be re-closed
 * (idempotent steps make the retry safe). LOCKED is terminal — there is no reopen path here.
 */
@Injectable()
export class FiscalPeriodsService implements OnModuleInit {
  constructor(
    @InjectRepository(AccountingPeriod) private readonly periodRepo: Repository<AccountingPeriod>,
    @InjectRepository(PeriodCloseRun) private readonly runRepo: Repository<PeriodCloseRun>,
    @Inject(PERIOD_CLOSE_STEPS) private readonly steps: PeriodCloseStep[],
    private readonly dataSource: DataSource,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    this.logger.setContext('FiscalPeriodsService')
  }

  async onModuleInit(): Promise<void> {
    await this.recoverCrashedCloses()
  }

  /** A close that didn't finish leaves the period in CLOSING; on boot, roll it back to OPEN so it
   *  can be re-closed. Mirrors the sync engine's recoverNonTerminalBatches. */
  async recoverCrashedCloses(): Promise<void> {
    const res = await this.periodRepo.update(
      { status: PeriodStatus.CLOSING },
      { status: PeriodStatus.OPEN },
    )
    if (res.affected) {
      this.logger.warn(`Recovered ${res.affected} period(s) stuck in CLOSING → OPEN`)
    }
  }

  private async findPeriod(businessId: string, periodId: string): Promise<AccountingPeriod> {
    const period = await this.periodRepo.findOne({ where: { id: periodId, businessId } })
    if (!period) throw new AppNotFoundException('Accounting period not found.', 'PERIOD_NOT_FOUND')
    return period
  }

  /** Close a period: OPEN → CLOSING → run steps (idempotent) → snapshot → CLOSED. Earlier periods
   *  in the same fiscal year must be closed first (sequential close). */
  async closePeriod(
    businessId: string,
    periodId: string,
    userId: string,
  ): Promise<AccountingPeriod> {
    const period = await this.findPeriod(businessId, periodId)
    if (period.status !== PeriodStatus.OPEN) {
      throw new AppBadRequestException(
        `Only an open period can be closed (it is ${period.status}).`,
        'PERIOD_NOT_OPEN',
      )
    }
    const earlierOpen = await this.periodRepo.count({
      where: {
        businessId,
        fiscalYearId: period.fiscalYearId,
        periodNumber: LessThan(period.periodNumber),
        status: In([PeriodStatus.OPEN, PeriodStatus.CLOSING]),
      },
    })
    if (earlierOpen > 0) {
      throw new AppBadRequestException(
        'Close the earlier periods in this fiscal year first.',
        'PERIOD_OUT_OF_ORDER',
      )
    }

    period.status = PeriodStatus.CLOSING
    await this.periodRepo.save(period)

    // Run each registered step once per (period, close_version). Empty today → a no-op loop.
    for (const step of this.steps) {
      const already = await this.runRepo.findOne({
        where: { periodId: period.id, stepKey: step.key, closeVersion: period.closeVersion },
      })
      if (already) continue
      const outcome = await step.run({ businessId, period, closeVersion: period.closeVersion })
      const run = this.runRepo.create({
        businessId,
        periodId: period.id,
        closeVersion: period.closeVersion,
        stepKey: step.key,
        status: 'COMPLETED',
        result: outcome ? outcome : null,
        ranAt: new Date(),
      })
      try {
        await this.runRepo.save(run)
      } catch {
        // Unique (period, step, version) — a concurrent close already recorded it. Idempotent.
      }
    }

    period.closeSnapshot = await this.computeSnapshot(businessId, period, userId)
    period.status = PeriodStatus.CLOSED
    period.closedAt = new Date()
    return this.periodRepo.save(period)
  }

  /** Lock a closed period. Terminal — there is no reopen path (by design). */
  async lockPeriod(businessId: string, periodId: string): Promise<AccountingPeriod> {
    const period = await this.findPeriod(businessId, periodId)
    if (period.status !== PeriodStatus.CLOSED) {
      throw new AppBadRequestException(
        `Only a closed period can be locked (it is ${period.status}).`,
        'PERIOD_NOT_CLOSED',
      )
    }
    period.status = PeriodStatus.LOCKED
    return this.periodRepo.save(period)
  }

  /** Freeze the period's headline figures at close, so later drift can be detected. Uses the
   *  business_date grain (BIZ-5.1); this is a summary, not a full trial balance (which arrives
   *  with the ledger). */
  private async computeSnapshot(
    businessId: string,
    period: AccountingPeriod,
    userId: string,
  ): Promise<Record<string, unknown>> {
    const salesRows = (await this.dataSource.query(
      `SELECT COALESCE(SUM(total_amount), 0) AS total, COUNT(*)::int AS count
         FROM sales
        WHERE business_id = $1 AND status = 'COMPLETED' AND deleted_at IS NULL
          AND COALESCE(business_date, sale_date) BETWEEN $2 AND $3`,
      [businessId, period.startDate, period.endDate],
    )) as Array<{ total: string; count: number }>
    const expenseRows = (await this.dataSource.query(
      `SELECT COALESCE(SUM(amount), 0) AS total
         FROM expenses
        WHERE business_id = $1 AND deleted_at IS NULL
          AND COALESCE(business_date, date) BETWEEN $2 AND $3`,
      [businessId, period.startDate, period.endDate],
    )) as Array<{ total: string }>

    return {
      salesTotal: Number(salesRows[0]?.total ?? 0),
      salesCount: Number(salesRows[0]?.count ?? 0),
      expenseTotal: Number(expenseRows[0]?.total ?? 0),
      closedByUserId: userId,
      generatedAt: new Date().toISOString(),
    }
  }
}
