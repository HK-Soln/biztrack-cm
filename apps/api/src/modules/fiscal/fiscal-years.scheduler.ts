import { Injectable } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { FiscalYearsService } from './fiscal-years.service'

/**
 * BIZ-5.2 — keeps each business's current + next fiscal year generated ahead of time, so an
 * offline device always has the upcoming periods (never generated lazily). Mirrors the
 * SubscriptionsScheduler pattern; ScheduleModule.forRoot is registered globally in
 * SubscriptionsModule. Idempotent, so a daily run costs almost nothing once generated.
 */
@Injectable()
export class FiscalYearsScheduler {
  constructor(private readonly fiscalYears: FiscalYearsService) {}

  @Cron('7 3 * * *', { timeZone: 'Africa/Douala' })
  async ensureUpcoming(): Promise<void> {
    await this.fiscalYears.ensureUpcomingForAll()
  }
}
