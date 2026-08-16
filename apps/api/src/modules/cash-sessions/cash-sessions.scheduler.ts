import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { CashSessionsService } from './services/cash-sessions.service'

/**
 * Sweeps orphaned cash sessions to ABANDONED (BIZ-2.5). Hourly is plenty — the threshold
 * is 72h, so exact timing doesn't matter. Mirrors the SubscriptionsScheduler pattern.
 */
@Injectable()
export class CashSessionsScheduler {
  private readonly logger = new Logger(CashSessionsScheduler.name)

  constructor(private readonly cashSessions: CashSessionsService) {}

  @Cron(CronExpression.EVERY_HOUR, { timeZone: 'Africa/Douala' })
  async sweepAbandoned(): Promise<void> {
    const count = await this.cashSessions.markAbandonedSessions()
    if (count > 0) this.logger.log(`Marked ${count} orphaned cash session(s) as ABANDONED`)
  }
}
