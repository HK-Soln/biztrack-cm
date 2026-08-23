import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Business } from '@/entities/business.entity'
import { FiscalYear } from '@/entities/fiscal-year.entity'
import { AccountingPeriod } from '@/entities/accounting-period.entity'
import { PeriodCloseRun } from '@/entities/period-close-run.entity'
import { BusinessCalendarModule } from '@/modules/business-calendar/business-calendar.module'
import { FiscalYearsService } from './fiscal-years.service'
import { FiscalYearsScheduler } from './fiscal-years.scheduler'
import { FiscalPeriodsService } from './fiscal-periods.service'
import { PostingDateService } from './posting-date.service'
import { FiscalController } from './fiscal.controller'
/**
 * BIZ-5.2/5.3/5.5 — fiscal years + accounting periods + the idempotent close pipeline. The API
 * generates the calendar (business setup + daily scheduler), owns closing/locking, and syncs
 * periods down to the desktop. Exported for BusinessModule (setup hook) and SyncModule (pull).
 *
 * The close pipeline runs EMPTY today. A feature module (Fixed Assets, etc.) contributes a step by
 * exporting `{ provide: PERIOD_CLOSE_STEP, useClass: MyStep, multi: true }` and being imported here;
 * FiscalPeriodsService injects every registered step as an array with no surgery on the close code.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Business, FiscalYear, AccountingPeriod, PeriodCloseRun]),
    BusinessCalendarModule,
  ],
  controllers: [FiscalController],
  providers: [FiscalYearsService, FiscalYearsScheduler, FiscalPeriodsService, PostingDateService],
  exports: [FiscalYearsService, PostingDateService],
})
export class FiscalModule {}
