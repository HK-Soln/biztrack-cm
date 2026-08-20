import { Inject, Injectable } from '@nestjs/common'
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq'
import { InjectRepository } from '@nestjs/typeorm'
import type { Logger } from '@biztrack/logger'
import { NotificationType } from '@biztrack/types'
import { computeRevenueAtRisk } from '@biztrack/utils'
import type { Job, Queue } from 'bullmq'
import { Repository } from 'typeorm'
import { RedisService } from '@/common/redis/redis.service'
import { SyncFreshnessService } from '@/common/sync-freshness/sync-freshness.service'
import { Locale } from '@/common/enums/locale.enum'
import { LOGGER } from '@/logger/logger.module'
import { Business } from '@/entities/business.entity'
import { ReorderAlertLog } from '@/entities/reorder-alert-log.entity'
import { NotificationsService } from '@/modules/notifications/services/notifications.service'
import { NotificationDispatcher } from '@/modules/notifications/services/notification-dispatcher.service'
import {
  INVENTORY_ALERTS_QUEUE,
  INVENTORY_LOW_STOCK_ALERT_CACHE_TTL_SECONDS,
  INVENTORY_LOW_STOCK_DISPATCH_JOB,
  INVENTORY_LOW_STOCK_SCAN_JOB,
  INVENTORY_LOW_STOCK_TIMEZONE,
  REORDER_SUPPRESSION_HOURS,
  SYNC_STALE_ALERT_SUPPRESSION_SECONDS,
  type InventoryLowStockDispatchJobData,
  type InventoryLowStockScanJobData,
} from '../constants/inventory.constants'
import { InventoryService } from '../services/inventory.service'

type InventoryAlertsJobData = InventoryLowStockScanJobData | InventoryLowStockDispatchJobData

// Notification copy per business language (the owner's user.language). Localized here
// rather than in the shared i18n JSON to avoid depending on the auto-regenerated
// i18n.generated.ts type; the strings are producer-specific.
const NOTIF_COPY = {
  [Locale.EN]: {
    lowStockTitle: (n: number) => `${n} product${n > 1 ? 's' : ''} to reorder`,
    lowStockBody: (risk: string) => `About ${risk} XAF/day at risk. Tap to reorder.`,
    lowStockBodyNoRisk: 'Tap to reorder.',
    syncStaleTitle: 'Your data is out of date',
    syncStaleBody: "Your device hasn't synced recently. Sync for reliable alerts.",
    numberLocale: 'en-US',
  },
  [Locale.FR]: {
    lowStockTitle: (n: number) => `${n} produit${n > 1 ? 's' : ''} à commander`,
    lowStockBody: (risk: string) =>
      `Environ ${risk} XAF/jour à risque. Touchez pour réapprovisionner.`,
    lowStockBodyNoRisk: 'Touchez pour réapprovisionner.',
    syncStaleTitle: 'Vos données ne sont pas à jour',
    syncStaleBody:
      "Votre appareil n'a pas synchronisé récemment. Synchronisez pour des alertes fiables.",
    numberLocale: 'fr-FR',
  },
} as const

const businessLang = (business: Business | null): Locale =>
  business?.owner?.language === Locale.EN ? Locale.EN : Locale.FR

@Injectable()
@Processor(INVENTORY_ALERTS_QUEUE)
export class InventoryAlertsProcessor extends WorkerHost {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly redis: RedisService,
    @InjectQueue(INVENTORY_ALERTS_QUEUE)
    private readonly queue: Queue,
    private readonly dispatcher: NotificationDispatcher,
    private readonly notifications: NotificationsService,
    private readonly syncFreshness: SyncFreshnessService,
    @InjectRepository(ReorderAlertLog)
    private readonly reorderAlertRepo: Repository<ReorderAlertLog>,
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    super()
  }

  async process(job: Job<InventoryAlertsJobData>): Promise<unknown> {
    if (job.name === INVENTORY_LOW_STOCK_SCAN_JOB) {
      return this.processDailyScan(job as Job<InventoryLowStockScanJobData>)
    }

    if (job.name === INVENTORY_LOW_STOCK_DISPATCH_JOB) {
      return this.processBusinessDispatch(job as Job<InventoryLowStockDispatchJobData>)
    }

    this.logger.warn('Skipping unknown inventory alerts job', 'InventoryAlertsProcessor', {
      jobId: job.id,
      jobName: job.name,
    })

    return { status: 'skipped', reason: 'unknown_job', jobName: job.name }
  }

  private async processDailyScan(job: Job<InventoryLowStockScanJobData>) {
    const businessIds = await this.inventoryService.findBusinessIdsWithLowStockAlerts()
    const dayKey = this.formatDayKey(new Date())

    for (const businessId of businessIds) {
      await this.queue.add(
        INVENTORY_LOW_STOCK_DISPATCH_JOB,
        {
          businessId,
          requestedAt: new Date().toISOString(),
          sourceJobId: job.id ?? null,
        },
        { jobId: `${INVENTORY_LOW_STOCK_DISPATCH_JOB}-${businessId}-${dayKey}` },
      )
    }

    this.logger.log('Queued low-stock business alert jobs', 'InventoryAlertsProcessor', {
      sourceJobId: job.id,
      businessCount: businessIds.length,
    })

    return { status: 'queued', businessCount: businessIds.length }
  }

  private async processBusinessDispatch(job: Job<InventoryLowStockDispatchJobData>) {
    const { businessId } = job.data
    const business = await this.businessRepo.findOne({
      where: { id: businessId },
      relations: ['owner'],
    })
    const copy = NOTIF_COPY[businessLang(business)]

    // 1) Sync-freshness guard: a digest computed over stale synced data would be wrong,
    //    so ask the owner to sync instead of sending a misleading alert.
    const lastSync = await this.syncFreshness.lastSyncedAt(businessId)
    if (this.syncFreshness.isStale(lastSync)) {
      await this.sendStaleSyncAlert(business, copy)
      return { status: 'skipped', businessId, reason: 'stale_sync' }
    }

    // 2) Build the digest (alerts already carry velocity + supplier + selling price).
    const digest = await this.inventoryService.buildLowStockAlertDigest(businessId)
    if (!digest) {
      return { status: 'skipped', businessId, reason: 'no_low_stock_alerts' }
    }

    // Keep the Redis snapshot (unchanged — used by the online admin surface).
    await this.redis.setex(
      `inventory:low-stock:last-run:${digest.businessId}`,
      INVENTORY_LOW_STOCK_ALERT_CACHE_TTL_SECONDS,
      JSON.stringify(digest),
    )

    // 3) 72h per-product suppression — only notify when a product is newly (or not
    //    recently) low, so a persistently-low product doesn't ping the owner daily.
    const productIds = digest.alerts.map((a) => a.productId)
    const suppressed = await this.suppressedProductIds(businessId, productIds)
    const fresh = productIds.filter((id) => !suppressed.has(id))
    if (fresh.length === 0) {
      return { status: 'skipped', businessId, reason: 'all_recently_alerted' }
    }

    // 4) Dispatch through the notification control plane (respects prefs + quiet hours).
    const totalRisk = digest.alerts.reduce(
      (sum, a) =>
        sum +
        computeRevenueAtRisk({
          sellingPrice: a.sellingPrice ?? null,
          velocity: a.velocity,
          suggestedQty: Math.max(1, a.shortfall),
        }),
      0,
    )
    const count = digest.alerts.length
    await this.dispatcher.dispatch({
      businessId,
      event: NotificationType.LOW_STOCK,
      title: copy.lowStockTitle(count),
      body:
        totalRisk > 0
          ? copy.lowStockBody(totalRisk.toLocaleString(copy.numberLocale))
          : copy.lowStockBodyNoRisk,
      deeplink: '/inventory',
      metadata: { productCount: count, freshCount: fresh.length, totalRevenueAtRisk: totalRisk },
    })

    // 5) Record so these products are suppressed for the window.
    await this.recordAlerted(businessId, productIds)

    this.logger.log('Dispatched low-stock digest', 'InventoryAlertsProcessor', {
      businessId,
      alertCount: count,
      freshCount: fresh.length,
      totalRevenueAtRisk: totalRisk,
    })

    return { status: 'dispatched', businessId, alertCount: count, freshCount: fresh.length }
  }

  /** Products alerted within the suppression window (still suppressed). */
  private async suppressedProductIds(
    businessId: string,
    productIds: string[],
  ): Promise<Set<string>> {
    if (productIds.length === 0) return new Set()
    const rows = (await this.reorderAlertRepo.query(
      `SELECT product_id FROM reorder_alert_log
       WHERE business_id = $1 AND product_id = ANY($2)
         AND alerted_at > now() - make_interval(hours => $3::int)`,
      [businessId, productIds, REORDER_SUPPRESSION_HOURS],
    )) as Array<{ product_id: string }>
    return new Set(rows.map((r) => r.product_id))
  }

  private async recordAlerted(businessId: string, productIds: string[]): Promise<void> {
    if (productIds.length === 0) return
    await this.reorderAlertRepo.query(
      `INSERT INTO reorder_alert_log (business_id, product_id, alerted_at)
       SELECT $1, pid, now() FROM unnest($2::uuid[]) AS pid
       ON CONFLICT (business_id, product_id) DO UPDATE SET alerted_at = now()`,
      [businessId, productIds],
    )
  }

  /** In-app "please sync" alert to the owner — a system alert, at most once per window. */
  private async sendStaleSyncAlert(
    business: Business | null,
    copy: (typeof NOTIF_COPY)[Locale],
  ): Promise<void> {
    if (!business?.ownerId) return
    const key = `inventory:stale-sync-alerted:${business.id}`
    if (await this.redis.get(key)) return
    await this.notifications.createInApp({
      userId: business.ownerId,
      businessId: business.id,
      type: NotificationType.SYNC_STALE,
      title: copy.syncStaleTitle,
      body: copy.syncStaleBody,
      deeplink: '/inventory',
    })
    await this.redis.setex(key, SYNC_STALE_ALERT_SUPPRESSION_SECONDS, '1')
    this.logger.warn(
      'Sent stale-sync alert (low-stock digest skipped)',
      'InventoryAlertsProcessor',
      {
        businessId: business.id,
        ownerId: business.ownerId,
      },
    )
  }

  private formatDayKey(date: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: INVENTORY_LOW_STOCK_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date)
  }
}
