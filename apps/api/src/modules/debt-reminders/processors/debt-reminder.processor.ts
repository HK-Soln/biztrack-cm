import { Inject, Injectable } from '@nestjs/common'
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq'
import { InjectRepository } from '@nestjs/typeorm'
import type { Logger } from '@biztrack/logger'
import { DebtDirection, DebtStatus } from '@biztrack/types'
import type { Job, Queue } from 'bullmq'
import { Repository } from 'typeorm'
import { RedisService } from '@/common/redis/redis.service'
import { SyncFreshnessService } from '@/common/sync-freshness/sync-freshness.service'
import { dayKeyInTimezone } from '@/common/time/timezone.util'
import { LOGGER } from '@/logger/logger.module'
import { Debt } from '@/entities/debt.entity'
import {
  DEBT_REMINDER_DISPATCH_JOB,
  DEBT_REMINDER_QUEUE,
  DEBT_REMINDER_SCAN_JOB,
  DEBT_REMINDER_SENT_TTL_SECONDS,
  DEBT_REMINDER_TIMEZONE,
  type DebtReminderDispatchJobData,
  type DebtReminderScanJobData,
} from '../constants/debt-reminders.constants'
import { DebtReminderService } from '../services/debt-reminder.service'

type DebtReminderJobData = DebtReminderScanJobData | DebtReminderDispatchJobData

const sentMarkerKey = (businessId: string, dayKey: string): string =>
  `debt-reminder:sent:${businessId}:${dayKey}`

@Injectable()
@Processor(DEBT_REMINDER_QUEUE)
export class DebtReminderProcessor extends WorkerHost {
  constructor(
    @InjectQueue(DEBT_REMINDER_QUEUE)
    private readonly queue: Queue,
    @InjectRepository(Debt)
    private readonly debtRepo: Repository<Debt>,
    private readonly reminders: DebtReminderService,
    private readonly syncFreshness: SyncFreshnessService,
    private readonly redis: RedisService,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    super()
  }

  async process(job: Job<DebtReminderJobData>): Promise<unknown> {
    if (job.name === DEBT_REMINDER_SCAN_JOB) {
      return this.processScan()
    }
    if (job.name === DEBT_REMINDER_DISPATCH_JOB) {
      return this.processDispatch(job as Job<DebtReminderDispatchJobData>)
    }
    this.logger.warn('Skipping unknown debt-reminder job', 'DebtReminderProcessor', {
      jobId: job.id,
      jobName: job.name,
    })
    return { status: 'skipped', reason: 'unknown_job', jobName: job.name }
  }

  /** Fan out a reminder job for every business that has outstanding receivables. The
   *  per-business dispatch decides whether anything is actually overdue. */
  private async processScan() {
    const rows = (await this.debtRepo.query(
      `SELECT DISTINCT business_id FROM debts
       WHERE direction = $1 AND status IN ($2, $3) AND deleted_at IS NULL`,
      [DebtDirection.RECEIVABLE, DebtStatus.OUTSTANDING, DebtStatus.PARTIALLY_PAID],
    )) as Array<{ business_id: string }>

    const dayKey = dayKeyInTimezone(new Date(), DEBT_REMINDER_TIMEZONE)
    for (const { business_id } of rows) {
      await this.queue.add(
        DEBT_REMINDER_DISPATCH_JOB,
        { businessId: business_id, dayKey, requestedAt: new Date().toISOString() },
        { jobId: `${DEBT_REMINDER_DISPATCH_JOB}-${business_id}-${dayKey}` },
      )
    }
    this.logger.log('Queued debt-reminder dispatch jobs', 'DebtReminderProcessor', {
      businesses: rows.length,
    })
    return { status: 'queued', businesses: rows.length }
  }

  private async processDispatch(job: Job<DebtReminderDispatchJobData>) {
    const { businessId, dayKey } = job.data

    const marker = sentMarkerKey(businessId, dayKey)
    if (await this.redis.get(marker)) {
      return { status: 'skipped', businessId, reason: 'already_sent' }
    }

    // Stale synced data would misstate what's overdue; skip (the low-stock scan owns the
    // "please sync" nudge). Cloud-only businesses are never stale.
    const lastSync = await this.syncFreshness.lastSyncedAt(businessId)
    if (this.syncFreshness.isStale(lastSync)) {
      return { status: 'skipped', businessId, reason: 'stale_sync' }
    }

    const summary = await this.reminders.runReminder(businessId)
    if (!summary) return { status: 'skipped', businessId, reason: 'nothing_overdue' }

    await this.redis.setex(marker, DEBT_REMINDER_SENT_TTL_SECONDS, '1')
    this.logger.log('Dispatched debt-due reminder', 'DebtReminderProcessor', {
      businessId,
      count: summary.count,
      totalPastDue: summary.totalPastDue,
    })
    return { status: 'dispatched', businessId, count: summary.count }
  }
}
