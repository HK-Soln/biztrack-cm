import { Inject, Injectable, OnModuleInit } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import type { Logger } from '@biztrack/logger'
import type { Queue } from 'bullmq'
import { LOGGER } from '@/logger/logger.module'
import {
  DEBT_REMINDER_CRON_PATTERN,
  DEBT_REMINDER_QUEUE,
  DEBT_REMINDER_SCAN_JOB,
  DEBT_REMINDER_TIMEZONE,
} from '../constants/debt-reminders.constants'

/** Registers the daily debt-due scan (08:00). One repeatable job; the scan fans out a
 *  per-business reminder for anyone with past-due receivables. */
@Injectable()
export class DebtReminderScheduler implements OnModuleInit {
  constructor(
    @InjectQueue(DEBT_REMINDER_QUEUE)
    private readonly queue: Queue,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.remove(DEBT_REMINDER_SCAN_JOB)
    await this.queue.add(
      DEBT_REMINDER_SCAN_JOB,
      { requestedAt: new Date().toISOString(), triggeredBy: 'scheduler' },
      { repeat: { pattern: DEBT_REMINDER_CRON_PATTERN, tz: DEBT_REMINDER_TIMEZONE } },
    )
    this.logger.log('Registered debt-reminder daily scan', 'DebtReminderScheduler', {
      queue: DEBT_REMINDER_QUEUE,
      pattern: DEBT_REMINDER_CRON_PATTERN,
      timeZone: DEBT_REMINDER_TIMEZONE,
    })
  }
}
