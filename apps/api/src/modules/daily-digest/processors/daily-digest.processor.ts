import { Inject, Injectable } from '@nestjs/common'
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq'
import { InjectRepository } from '@nestjs/typeorm'
import type { Logger } from '@biztrack/logger'
import {
  DEFAULT_DAILY_DIGEST_OFFSET_MINUTES,
  DEFAULT_NOTIFICATION_TIMEZONE,
  NotificationType,
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
import { Locale } from '@/common/enums/locale.enum'
import { LOGGER } from '@/logger/logger.module'
import { Business } from '@/entities/business.entity'
import { NotificationSetting } from '@/entities/notification-setting.entity'
import { NotificationDispatcher } from '@/modules/notifications/services/notification-dispatcher.service'
import {
  DAILY_DIGEST_DISPATCH_JOB,
  DAILY_DIGEST_QUEUE,
  DAILY_DIGEST_SCAN_JOB,
  DAILY_DIGEST_SENT_TTL_SECONDS,
  type DailyDigestDispatchJobData,
  type DailyDigestScanJobData,
} from '../constants/daily-digest.constants'
import { DailyDigestService, type DailyDigestFigures } from '../services/daily-digest.service'

type DailyDigestJobData = DailyDigestScanJobData | DailyDigestDispatchJobData

const signed = (v: number, locale: string): string =>
  `${v >= 0 ? '+' : '-'}${Math.abs(v).toLocaleString(locale)}`

// Digest copy per business language (the owner's user.language). Producer-specific, so
// kept inline rather than in the auto-regenerated i18n.generated.ts (matches the
// low-stock producer). Each builder returns one line; the body joins them with '\n'.
const DIGEST_COPY = {
  [Locale.EN]: {
    numberLocale: 'en-US',
    title: (name: string) => `Daily summary — ${name}`,
    revenue: (v: string) => `Revenue: ${v} XAF`,
    profit: (v: string) => `Profit: ${v} XAF`,
    variance: (v: string) => `Cash variance: ${v} XAF`,
    noCash: 'No cash drawer was closed today.',
    discounts: (v: string) => `Discounts: ${v} XAF`,
    lowStock: (n: number) => `${n} product${n > 1 ? 's' : ''} to reorder`,
    lowStockNone: 'Stock levels OK',
    receivables: (out: string, over: string) => `Receivables: ${out} XAF (${over} overdue)`,
  },
  [Locale.FR]: {
    numberLocale: 'fr-FR',
    title: (name: string) => `Résumé du jour — ${name}`,
    revenue: (v: string) => `Recette : ${v} XAF`,
    profit: (v: string) => `Bénéfice : ${v} XAF`,
    variance: (v: string) => `Écart caisse : ${v} XAF`,
    noCash: 'Aucune caisse clôturée aujourd’hui.',
    discounts: (v: string) => `Remises : ${v} XAF`,
    lowStock: (n: number) => `${n} produit${n > 1 ? 's' : ''} à commander`,
    lowStockNone: 'Niveaux de stock OK',
    receivables: (out: string, over: string) => `Créances : ${out} XAF (${over} en retard)`,
  },
} as const

const businessLang = (business: Business | null): Locale =>
  business?.owner?.language === Locale.EN ? Locale.EN : Locale.FR

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
    private readonly dispatcher: NotificationDispatcher,
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
      select: ['id', 'businessHours'],
    })
    if (businesses.length === 0) return { status: 'idle', due: 0 }

    const settings = await this.settingRepo.find({
      where: { businessId: In(businesses.map((b) => b.id)) },
    })
    const settingMap = new Map(settings.map((s) => [s.businessId, s]))

    let due = 0
    for (const business of businesses) {
      const setting = settingMap.get(business.id) ?? null
      const tz = setting?.timezone || DEFAULT_NOTIFICATION_TIMEZONE
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

    const business = await this.businessRepo.findOne({
      where: { id: businessId },
      relations: ['owner'],
    })
    if (!business) return { status: 'skipped', businessId, reason: 'business_not_found' }
    const copy = DIGEST_COPY[businessLang(business)]

    // Stale synced data would make the recap wrong; skip (the low-stock scan owns the
    // "please sync" nudge). Cloud-only businesses (no device sessions) are never stale.
    const lastSync = await this.syncFreshness.lastSyncedAt(businessId)
    if (this.syncFreshness.isStale(lastSync)) {
      return { status: 'skipped', businessId, reason: 'stale_sync' }
    }

    const figures = await this.digest.computeFigures(businessId, dayKey)
    await this.dispatcher.dispatch({
      businessId,
      event: NotificationType.DAILY_SUMMARY,
      title: copy.title(business.name),
      body: this.buildBody(copy, figures),
      deeplink: '/reports',
      metadata: { dayKey, ...figures },
    })

    await this.redis.setex(marker, DAILY_DIGEST_SENT_TTL_SECONDS, '1')
    this.logger.log('Dispatched daily digest', 'DailyDigestProcessor', { businessId, dayKey })
    return { status: 'dispatched', businessId, dayKey }
  }

  private buildBody(copy: (typeof DIGEST_COPY)[Locale], f: DailyDigestFigures): string {
    const n = (v: number) => v.toLocaleString(copy.numberLocale)
    return [
      copy.revenue(n(f.revenue)),
      copy.profit(n(f.profit)),
      f.cashShifts > 0 ? copy.variance(signed(f.cashVariance, copy.numberLocale)) : copy.noCash,
      copy.discounts(n(f.discounts)),
      f.lowStock > 0 ? copy.lowStock(f.lowStock) : copy.lowStockNone,
      copy.receivables(n(f.receivablesOutstanding), n(f.receivablesOverdue)),
    ].join('\n')
  }
}
