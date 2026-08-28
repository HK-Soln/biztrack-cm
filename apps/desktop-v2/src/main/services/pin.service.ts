import bcrypt from 'bcryptjs'
import { isStrongPin } from '@biztrack/utils'
import type { DatabaseService } from '@biztrack/electron-core'
import type { SetMemberPinResponse } from '@biztrack/types'
import type { PinVerifyReason, PinVerifyResult } from '../../shared/ipc'
import type { AuditLogger } from './audit.service'

/** The only HTTP capability PinService needs — satisfied by the app's HttpClient. */
export interface PinHttp {
  patch<T>(url: string, body?: unknown): Promise<{ data: T }>
}

// Offline manager-PIN credential (BIZ-3.1), device side. The PIN is hashed and
// verified entirely on-device with bcrypt; the server only distributes the hash
// (pulled into local business_members). Setting a PIN requires connectivity;
// verifying it for manager step-up works fully offline.

/**
 * A PIN is exactly 6 digits (1e6 keyspace) and must pass the strength rules in
 * @biztrack/utils (no ≥3-in-a-row, no sequences, no well-known patterns). The hash is
 * distributed to every in-business device, so weak PINs are trivially brute-forced;
 * the raised bcrypt cost below plus these rules keep that attack impractical.
 */
const PIN_PATTERN = /^\d{6}$/
/** bcrypt cost. Higher than the password path (10) specifically because the PIN
 * keyspace is small and the hash is distributed to devices an attacker may control. */
const BCRYPT_COST = 12
/** A device that has not synced within this window refuses manager step-up and
 * demands a fresh sync — so a revoked/rotated PIN cannot be used indefinitely offline. */
const STALE_AFTER_MS = 30 * 24 * 60 * 60 * 1000
/** Failed manager-PIN attempts before this device locks step-up for a cool-down. */
const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 5 * 60 * 1000

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
  // In-memory step-up throttle for this app run. A local attacker who can restart
  // the process (or read the DB) is already covered by the on-device hash threat;
  // this exists to stop casual PIN-guessing during a session.
  private failedAttempts = 0
  private lockedUntil: number | null = null

  constructor(
    private readonly http: PinHttp,
    private readonly db: DatabaseService,
    private readonly getContext: () => PinContext,
    private readonly getLastSyncAt: () => string | null,
    private readonly audit: AuditLogger,
  ) {}

  /**
   * Set or rotate the current user's manager PIN. Requires connectivity: the PIN
   * is hashed locally, sent to the server (hash only, never the PIN), then written
   * to the local membership so it is usable before the next pull confirms it.
   */
  async setPin(pin: string): Promise<{ pinVersion: number }> {
    const { businessId, userId } = this.getContext()
    if (!businessId || !userId) throw new Error('No active business session.')
    // Enforce strength server-of-record-side too: the renderer guides the user, but
    // the main process must never store a weak PIN even if the UI is bypassed.
    if (!isStrongPin(pin)) throw new Error('PIN is too easy to guess.')

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
   * matches. Refuses on a stale device (demands a sync) or while locked out after
   * repeated failures. Each failure is audited; never reveals which manager was tried.
   */
  /** Verify a manager PIN (BIZ-3.2). Thin wrapper over the method-aware verifier. */
  async verifyManagerPin(pin: string): Promise<PinVerifyResult> {
    return this.verifyAuthorization({ method: 'PIN', secret: pin })
  }

  /**
   * BIZ-3.3 — verify an authorization by any credential method (PIN, and CARD in slice 3). Hashes
   * the presented secret against every authorizing member's live credential of that type and
   * returns the matching identity. Same rate-limit / lockout / stale-device rules as the PIN path.
   */
  async verifyAuthorization(input: {
    method: 'PIN' | 'CARD'
    secret: string
  }): Promise<PinVerifyResult> {
    const { method, secret } = input
    const { businessId } = this.getContext()
    if (!businessId) throw new Error('No active business session.')

    const now = Date.now()
    if (this.lockedUntil !== null) {
      if (now < this.lockedUntil) return this.lockedResult()
      // Cool-down elapsed — reset and allow a fresh set of attempts.
      this.lockedUntil = null
      this.failedAttempts = 0
    }

    if (this.isDeviceStale()) return DENIED('STALE_DEVICE')
    if (method === 'PIN' && !PIN_PATTERN.test(secret)) return DENIED('INVALID_FORMAT')

    const managers = this.loadAuthorizers(businessId, method)

    for (const manager of managers) {
      if (await bcrypt.compare(secret, manager.hash)) {
        this.failedAttempts = 0
        this.lockedUntil = null
        return {
          authorized: true,
          authorizedByUserId: manager.user_id,
          authorizedByName: manager.name,
        }
      }
    }

    // Wrong PIN: count it, audit it, and lock the device once the limit is hit.
    this.failedAttempts += 1
    this.audit.log({
      action: 'PIN_FAILED',
      entityType: 'pin_authorization',
      entityId: 'manager-step-up',
      entityLabel: `attempt ${this.failedAttempts}/${MAX_ATTEMPTS}`,
    })
    if (this.failedAttempts >= MAX_ATTEMPTS) {
      this.lockedUntil = now + LOCKOUT_MS
      this.audit.log({
        action: 'PIN_LOCKED',
        entityType: 'pin_authorization',
        entityId: 'manager-step-up',
        entityLabel: `locked ${LOCKOUT_MS / 60000}m`,
      })
      return this.lockedResult()
    }
    return { ...DENIED('NO_MATCH'), attemptsRemaining: MAX_ATTEMPTS - this.failedAttempts }
  }

  /**
   * Whether the CURRENT user may manage a PIN — i.e. their role is flagged
   * can_authorize (or, for a role-less member, is OWNER/MANAGER). Used to show the
   * "Manager PIN" settings card only to those it applies to.
   */
  canManage(): boolean {
    const { businessId, userId } = this.getContext()
    if (!businessId || !userId) return false
    const row = this.db.get<{ ok: number }>(
      `SELECT 1 AS ok
         FROM business_members m
         LEFT JOIN roles r ON r.id = m.role_id AND r.is_deleted = 0
        WHERE m.business_id = ?
          AND m.user_id = ?
          AND m.is_deleted = 0
          AND m.status = 'ACTIVE'
          AND (r.can_authorize = 1 OR (m.role_id IS NULL AND m.role IN ('OWNER', 'MANAGER')))
        LIMIT 1`,
      [businessId, userId],
    )
    return !!row
  }

  /**
   * Authorizing members' credential hashes for a method. Any ACTIVE member whose role is flagged
   * can_authorize (Supervisor, Manager, Owner…) qualifies; role-less members fall back to the
   * OWNER/MANAGER enum. For PIN this is transition-safe (BIZ-3.3): it prefers the member's live
   * member_auth_credentials PIN row and falls back to the legacy business_members.pin_hash until
   * credentials have synced down.
   */
  private loadAuthorizers(
    businessId: string,
    method: 'PIN' | 'CARD',
  ): Array<{ user_id: string; name: string | null; hash: string }> {
    if (method === 'PIN') {
      return this.db.query<{ user_id: string; name: string | null; hash: string }>(
        `SELECT m.user_id, m.name, COALESCE(c.secret_hash, m.pin_hash) AS hash
           FROM business_members m
           LEFT JOIN roles r ON r.id = m.role_id AND r.is_deleted = 0
           LEFT JOIN member_auth_credentials c
             ON c.member_id = m.id AND c.type = 'PIN' AND c.revoked_at IS NULL AND c.deleted_at IS NULL
          WHERE m.business_id = ?
            AND m.is_deleted = 0
            AND m.status = 'ACTIVE'
            AND COALESCE(c.secret_hash, m.pin_hash) IS NOT NULL
            AND (r.can_authorize = 1 OR (m.role_id IS NULL AND m.role IN ('OWNER', 'MANAGER')))`,
        [businessId],
      )
    }
    return this.db.query<{ user_id: string; name: string | null; hash: string }>(
      `SELECT m.user_id, m.name, c.secret_hash AS hash
         FROM member_auth_credentials c
         JOIN business_members m ON m.id = c.member_id
         LEFT JOIN roles r ON r.id = m.role_id AND r.is_deleted = 0
        WHERE c.business_id = ?
          AND c.type = 'CARD'
          AND c.revoked_at IS NULL
          AND c.deleted_at IS NULL
          AND m.is_deleted = 0
          AND m.status = 'ACTIVE'
          AND (r.can_authorize = 1 OR (m.role_id IS NULL AND m.role IN ('OWNER', 'MANAGER')))`,
      [businessId],
    )
  }

  private lockedResult(): PinVerifyResult {
    return {
      ...DENIED('LOCKED_OUT'),
      lockedUntil: new Date(this.lockedUntil ?? Date.now()).toISOString(),
    }
  }

  private isDeviceStale(): boolean {
    const last = this.getLastSyncAt()
    const ts = last ? new Date(last).getTime() : NaN
    return !Number.isFinite(ts) || Date.now() - ts > STALE_AFTER_MS
  }
}
