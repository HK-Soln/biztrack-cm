import { Inject, Injectable } from '@nestjs/common'
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq'
import { InjectRepository } from '@nestjs/typeorm'
import type { Logger } from '@biztrack/logger'
import {
  DEFAULT_DAILY_DIGEST_OFFSET_MINUTES,
  DEFAULT_NOTIFICATION_TIMEZONE,
  clampDailyDigestOffset,
} from '@biztrack/types'
import type { Job, Queue } from 'bullmq'
import { In, IsNull, Not, Repository } from 'typeorm'
import { RedisService } from '@/common/redis/redis.service'
import { SyncFreshnessService } from '@/common/sync-freshness/sync-freshness.service'
import {
  dayKeyInTimezone,
  minutesOfDayInTimezone,
  weekdayInTimezone,
} from '@/common/time/timezone.util'
import { LOGGER } from '@/logger/logger.module'
import { Business } from '@/entities/business.entity'
import { NotificationSetting } from '@/entities/notification-setting.entity'
import {
  DAILY_DIGEST_DISPATCH_JOB,
  DAILY_DIGEST_QUEUE,
  DAILY_DIGEST_SCAN_JOB,
  DAILY_DIGEST_SENT_TTL_SECONDS,
  type DailyDigestDispatchJobData,
  type DailyDigestScanJobData,
} from '../constants/daily-digest.constants'
import { DailyDigestService } from '../services/daily-digest.service'

type DailyDigestJobData = DailyDigestScanJobData | DailyDigestDispatchJobData

const hhmmToMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

const sentMarkerKey = (businessId: string, dayKey: string): string =>
  `daily-digest:sent:${businessId}:${dayKey}`

@Injectable()
@Processor(DAILY_DIGEST_QUEUE)
export class DailyDigestProcessor extends WorkerHost {
  constructor(
    @InjectQueue(DAILY_DIGEST_QUEUE)
    private readonly queue: Queue,
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
    @InjectRepository(NotificationSetting)
    private readonly settingRepo: Repository<NotificationSetting>,
    private readonly digest: DailyDigestService,
    private readonly syncFreshness: SyncFreshnessService,
    private readonly redis: RedisService,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    super()
  }

  async process(job: Job<DailyDigestJobData>): Promise<unknown> {
    if (job.name === DAILY_DIGEST_SCAN_JOB) {
      return this.processScan()
    }
    if (job.name === DAILY_DIGEST_DISPATCH_JOB) {
      return this.processDispatch(job as Job<DailyDigestDispatchJobData>)
    }
    this.logger.warn('Skipping unknown daily-digest job', 'DailyDigestProcessor', {
      jobId: job.id,
      jobName: job.name,
    })
    return { status: 'skipped', reason: 'unknown_job', jobName: job.name }
  }

  /** Frequent tick: enqueue a dispatch for every business whose close-time+offset (in its
   *  own timezone) has just passed and which hasn't been sent today. */
  private async processScan() {
    const now = new Date()
    const businesses = await this.businessRepo.find({
      where: { businessHours: Not(IsNull()) },
      select: ['id', 'businessHours', 'timezone'],
    })
    if (businesses.length === 0) return { status: 'idle', due: 0 }

    const settings = await this.settingRepo.find({
      where: { businessId: In(businesses.map((b) => b.id)) },
    })
    const settingMap = new Map(settings.map((s) => [s.businessId, s]))

    let due = 0
    for (const business of businesses) {
      const setting = settingMap.get(business.id) ?? null
      // Canonical timezone is on the business now (BIZ-5.1); fall back to the dormant
      // notification setting then the default for not-yet-migrated rows.
      const tz = business.timezone || setting?.timezone || DEFAULT_NOTIFICATION_TIMEZONE
      const offset = clampDailyDigestOffset(
        setting?.dailyDigestOffsetMinutes ?? DEFAULT_DAILY_DIGEST_OFFSET_MINUTES,
      )

      const weekday = weekdayInTimezone(now, tz)
      const dayHours = business.businessHours?.[weekday]
      if (!dayHours) continue // closed today → no digest

      // Send moment = close + offset, clamped inside the same local day so a very late
      // closer still gets the day's recap that evening (not after midnight).
      const sendMin = Math.min(1439, hhmmToMinutes(dayHours.close) + offset)
      if (minutesOfDayInTimezone(now, tz) < sendMin) continue

      const dayKey = dayKeyInTimezone(now, tz)
      if (await this.redis.get(sentMarkerKey(business.id, dayKey))) continue

      await this.queue.add(
        DAILY_DIGEST_DISPATCH_JOB,
        { businessId: business.id, dayKey, requestedAt: now.toISOString() },
        { jobId: `${DAILY_DIGEST_DISPATCH_JOB}-${business.id}-${dayKey}` },
      )
      due += 1
    }

    if (due > 0) {
      this.logger.log('Queued daily-digest dispatch jobs', 'DailyDigestProcessor', { due })
    }
    return { status: 'scanned', businesses: businesses.length, due }
  }

  private async processDispatch(job: Job<DailyDigestDispatchJobData>) {
    const { businessId, dayKey } = job.data

    // Idempotency authority: never send the same business's digest twice for a day.
    const marker = sentMarkerKey(businessId, dayKey)
    if (await this.redis.get(marker)) {
      return { status: 'skipped', businessId, reason: 'already_sent' }
    }

    // Stale synced data would make the recap wrong; skip (the low-stock scan owns the
    // "please sync" nudge). Cloud-only businesses (no device sessions) are never stale.
    const lastSync = await this.syncFreshness.lastSyncedAt(businessId)
    if (this.syncFreshness.isStale(lastSync)) {
      return { status: 'skipped', businessId, reason: 'stale_sync' }
    }

    const figures = await this.digest.runDigest(businessId, dayKey)
    if (!figures) return { status: 'skipped', businessId, reason: 'business_not_found' }

    await this.redis.setex(marker, DAILY_DIGEST_SENT_TTL_SECONDS, '1')
    this.logger.log('Dispatched daily digest', 'DailyDigestProcessor', { businessId, dayKey })
    return { status: 'dispatched', businessId, dayKey }
  }
}
