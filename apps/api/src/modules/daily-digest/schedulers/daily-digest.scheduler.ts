import { Inject, Injectable, OnModuleInit } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import type { Logger } from '@biztrack/logger'
import type { Queue } from 'bullmq'
import { LOGGER } from '@/logger/logger.module'
import {
  DAILY_DIGEST_QUEUE,
  DAILY_DIGEST_SCAN_JOB,
  DAILY_DIGEST_TICK_CRON_PATTERN,
} from '../constants/daily-digest.constants'

/**
 * Registers the repeatable digest "tick". Unlike the low-stock scan (one fixed daily
 * time), the daily summary is sent relative to each business's own closing time in its
 * own timezone — so the tick runs frequently and the scan decides which businesses have
 * just crossed their send moment.
 */
@Injectable()
export class DailyDigestScheduler implements OnModuleInit {
  constructor(
    @InjectQueue(DAILY_DIGEST_QUEUE)
    private readonly queue: Queue,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async onModuleInit(): Promise<void> {
    // Remove any prior repeatable definition so restarts don't stack duplicates.
    await this.queue.remove(DAILY_DIGEST_SCAN_JOB)

    await this.queue.add(
      DAILY_DIGEST_SCAN_JOB,
      { requestedAt: new Date().toISOString(), triggeredBy: 'scheduler' },
      { repeat: { pattern: DAILY_DIGEST_TICK_CRON_PATTERN } },
    )

    this.logger.log('Registered daily-digest repeatable tick', 'DailyDigestScheduler', {
      queue: DAILY_DIGEST_QUEUE,
      pattern: DAILY_DIGEST_TICK_CRON_PATTERN,
    })
  }
}
