import bcrypt from 'bcryptjs'
import type { DatabaseService } from '@biztrack/electron-core'
import type { SetMemberPinResponse } from '@biztrack/types'
import type { PinVerifyReason, PinVerifyResult } from '../../shared/ipc'

/** The only HTTP capability PinService needs — satisfied by the app's HttpClient. */
export interface PinHttp {
  patch<T>(url: string, body?: unknown): Promise<{ data: T }>
}

// Offline manager-PIN credential (BIZ-3.1), device side. The PIN is hashed and
// verified entirely on-device with bcrypt; the server only distributes the hash
// (pulled into local business_members). Setting a PIN requires connectivity;
// verifying it for manager step-up works fully offline.

/**
 * A PIN is 6–8 digits. The manager's PIN hash is distributed to every in-business
 * device (offline verification), so a device holder can attempt to brute-force it
 * offline. A 6-digit minimum (1e6 keyspace) plus the raised bcrypt cost below keeps
 * that attack impractical; 4-digit PINs were too small a keyspace to distribute.
 */
const PIN_PATTERN = /^\d{6,8}$/
/** bcrypt cost. Higher than the password path (10) specifically because the PIN
 * keyspace is small and the hash is distributed to devices an attacker may control. */
const BCRYPT_COST = 12
/** A device that has not synced within this window refuses manager step-up and
 * demands a fresh sync — so a revoked/rotated PIN cannot be used indefinitely offline. */
const STALE_AFTER_MS = 30 * 24 * 60 * 60 * 1000

export interface PinContext {
  businessId: string | null
  userId: string | null
}

const DENIED = (reason: PinVerifyReason): PinVerifyResult => ({
  authorized: false,
  reason,
  authorizedByUserId: null,
  authorizedByName: null,
})

export class PinService {
  constructor(
    private readonly http: PinHttp,
    private readonly db: DatabaseService,
    private readonly getContext: () => PinContext,
    private readonly getLastSyncAt: () => string | null,
  ) {}

  /**
   * Set or rotate the current user's manager PIN. Requires connectivity: the PIN
   * is hashed locally, sent to the server (hash only, never the PIN), then written
   * to the local membership so it is usable before the next pull confirms it.
   */
  async setPin(pin: string): Promise<{ pinVersion: number }> {
    const { businessId, userId } = this.getContext()
    if (!businessId || !userId) throw new Error('No active business session.')
    if (!PIN_PATTERN.test(pin)) throw new Error('PIN must be 6 to 8 digits.')

    const pinHash = await bcrypt.hash(pin, BCRYPT_COST)
    const res = await this.http.patch<{ data: SetMemberPinResponse }>(
      '/businesses/members/me/pin',
      { pinHash },
    )
    const data = res.data.data

    this.db.run(
      `UPDATE business_members
         SET pin_hash = ?, pin_version = ?, pin_set_at = ?, updated_at = ?
       WHERE business_id = ? AND user_id = ?`,
      [pinHash, data.pinVersion, data.pinSetAt, new Date().toISOString(), businessId, userId],
    )
    return { pinVersion: data.pinVersion }
  }

  /**
   * Verify a manager PIN offline for step-up. Scans active OWNER/MANAGER members
   * of the current business that have a PIN set, and returns the first whose hash
   * matches. Refuses on a stale device (demands a sync). Never reveals which
   * manager was tried on failure.
   */
  async verifyManagerPin(pin: string): Promise<PinVerifyResult> {
    const { businessId } = this.getContext()
    if (!businessId) throw new Error('No active business session.')
    if (this.isDeviceStale()) return DENIED('STALE_DEVICE')
    if (!PIN_PATTERN.test(pin)) return DENIED('INVALID_FORMAT')

    const managers = this.db.query<{ user_id: string; name: string | null; pin_hash: string }>(
      `SELECT user_id, name, pin_hash
         FROM business_members
        WHERE business_id = ?
          AND is_deleted = 0
          AND status = 'ACTIVE'
          AND role IN ('OWNER', 'MANAGER')
          AND pin_hash IS NOT NULL`,
      [businessId],
    )

    for (const manager of managers) {
      if (await bcrypt.compare(pin, manager.pin_hash)) {
        return {
          authorized: true,
          authorizedByUserId: manager.user_id,
          authorizedByName: manager.name,
        }
      }
    }
    return DENIED('NO_MATCH')
  }

  private isDeviceStale(): boolean {
    const last = this.getLastSyncAt()
    const ts = last ? new Date(last).getTime() : NaN
    return !Number.isFinite(ts) || Date.now() - ts > STALE_AFTER_MS
  }
}
