import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { SyncDeviceSession } from '@/entities/sync-device-session.entity'

/** A business is considered stale if its most recent device sync is older than this. */
export const SYNC_FRESHNESS_STALE_HOURS = 36

/**
 * Answers "how fresh is a business's synced data?" — reused by every data-derived
 * notification producer (stock alerts, daily digest, receivables). The API computes
 * digests over synced data, so if a device hasn't synced recently the server's view is
 * stale and a digest would be wrong. Producers guard on this and, when stale, send a
 * "please sync" alert instead of the (wrong) digest.
 */
@Injectable()
export class SyncFreshnessService {
  constructor(
    @InjectRepository(SyncDeviceSession)
    private readonly sessionsRepo: Repository<SyncDeviceSession>,
  ) {}

  /** Most recent sync across the business's active devices, or null if it has none. */
  async lastSyncedAt(businessId: string): Promise<Date | null> {
    const row = await this.sessionsRepo
      .createQueryBuilder('s')
      .select('MAX(s.last_used_at)', 'lastUsedAt')
      .where('s.business_id = :businessId', { businessId })
      .andWhere('s.revoked_at IS NULL')
      .getRawOne<{ lastUsedAt: Date | string | null }>()
    const value = row?.lastUsedAt
    return value ? new Date(value) : null
  }

  /**
   * Stale = the business HAS synced before but its latest sync is older than the
   * threshold. A business with no device sessions is NOT stale — it's cloud-only (or
   * brand new), so its data is written straight to the API and is always current.
   */
  isStale(
    lastSyncedAt: Date | null,
    thresholdHours: number = SYNC_FRESHNESS_STALE_HOURS,
    now: Date = new Date(),
  ): boolean {
    if (!lastSyncedAt) return false
    return now.getTime() - lastSyncedAt.getTime() > thresholdHours * 3_600_000
  }
}
