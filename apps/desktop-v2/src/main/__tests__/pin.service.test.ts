import bcrypt from 'bcryptjs'
import { beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseService } from '@biztrack/electron-core'
import { createTestDatabase } from '@biztrack/electron-core/testing'
import type { AuditEntry, AuditLogger } from '../services/audit.service'
import { PinService, type PinContext } from '../services/pin.service'

const BIZ = 'biz-1'
const FRESH = () => new Date().toISOString()
const STALE = () => new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString()

/** An audit logger that records entries, for asserting PIN_FAILED/PIN_LOCKED. */
class RecordingAudit implements AuditLogger {
  entries: AuditEntry[] = []
  log(entry: AuditEntry): void {
    this.entries.push(entry)
  }
  actions(): string[] {
    return this.entries.map((e) => e.action)
  }
}
const noopAudit: AuditLogger = { log: () => {} }

function seedMember(
  db: DatabaseService,
  opts: {
    id: string
    userId: string
    role: string
    roleId?: string | null
    name?: string
    pinHash?: string | null
  },
): void {
  db.run(
    `INSERT INTO business_members
       (id, business_id, user_id, role, role_id, status, name, is_deleted, created_at, updated_at, pin_hash, pin_version)
     VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, 0, ?, ?, ?, ?)`,
    [
      opts.id,
      BIZ,
      opts.userId,
      opts.role,
      opts.roleId ?? null,
      opts.name ?? null,
      FRESH(),
      FRESH(),
      opts.pinHash ?? null,
      opts.pinHash ? 1 : 0,
    ],
  )
}

function seedRole(
  db: DatabaseService,
  opts: { id: string; name: string; canAuthorize: boolean },
): void {
  db.run(
    `INSERT INTO roles
       (id, business_id, name, is_system, is_owner_role, can_authorize, is_deleted, created_at, updated_at)
     VALUES (?, ?, ?, 0, 0, ?, 0, ?, ?)`,
    [opts.id, BIZ, opts.name, opts.canAuthorize ? 1 : 0, FRESH(), FRESH()],
  )
}

type PatchFn = <T>(url: string, body?: unknown) => Promise<{ data: T }>
const defaultPatch: PatchFn = async () =>
  ({ data: { data: { memberId: 'm-self', pinVersion: 1, pinSetAt: FRESH() } } }) as never

/** A PinService wired to a live in-memory DB, a fixed context, and a sync clock. */
function makeService(
  db: DatabaseService,
  getLastSyncAt: () => string | null,
  audit: AuditLogger = noopAudit,
  context: PinContext = { businessId: BIZ, userId: 'u-self' },
): PinService {
  return new PinService({ patch: defaultPatch }, db, () => context, getLastSyncAt, audit)
}

describe('PinService.verifyManagerPin', () => {
  let db: DatabaseService
  beforeEach(async () => {
    db = createTestDatabase()
    seedMember(db, {
      id: 'm-mgr',
      userId: 'u-mgr',
      role: 'MANAGER',
      name: 'Mercy Manager',
      pinHash: await bcrypt.hash('123456', 12),
    })
  })

  it('authorizes a correct manager PIN and identifies the authorizer', async () => {
    const svc = makeService(db, FRESH)
    const result = await svc.verifyManagerPin('123456')
    expect(result.authorized).toBe(true)
    expect(result.authorizedByUserId).toBe('u-mgr')
    expect(result.authorizedByName).toBe('Mercy Manager')
  })

  it('rejects a wrong PIN as NO_MATCH without naming a manager', async () => {
    const svc = makeService(db, FRESH)
    const result = await svc.verifyManagerPin('999999')
    expect(result).toEqual({
      authorized: false,
      reason: 'NO_MATCH',
      authorizedByUserId: null,
      authorizedByName: null,
      attemptsRemaining: 4,
    })
  })

  it('does not accept a cashier PIN (role-gated to OWNER/MANAGER)', async () => {
    seedMember(db, {
      id: 'm-cash',
      userId: 'u-cash',
      role: 'CASHIER',
      pinHash: await bcrypt.hash('654321', 12),
    })
    const svc = makeService(db, FRESH)
    expect((await svc.verifyManagerPin('654321')).authorized).toBe(false)
  })

  it('ignores managers with no PIN set', async () => {
    seedMember(db, { id: 'm-mgr2', userId: 'u-mgr2', role: 'MANAGER', pinHash: null })
    const svc = makeService(db, FRESH)
    // The only matching PIN belongs to the seeded manager; the PIN-less one is skipped.
    expect((await svc.verifyManagerPin('123456')).authorizedByUserId).toBe('u-mgr')
  })

  it('authorizes a custom role flagged can_authorize (e.g. Supervisor)', async () => {
    seedRole(db, { id: 'role-sup', name: 'Supervisor', canAuthorize: true })
    seedMember(db, {
      id: 'm-sup',
      userId: 'u-sup',
      role: 'STAFF',
      roleId: 'role-sup',
      name: 'Sam Supervisor',
      pinHash: await bcrypt.hash('846201', 12),
    })
    const svc = makeService(db, FRESH)
    const r = await svc.verifyManagerPin('846201')
    expect(r.authorized).toBe(true)
    expect(r.authorizedByUserId).toBe('u-sup')
  })

  it('does not authorize a role whose can_authorize is off, even with a PIN', async () => {
    seedRole(db, { id: 'role-cash', name: 'Cashier', canAuthorize: false })
    seedMember(db, {
      id: 'm-c',
      userId: 'u-c',
      role: 'STAFF',
      roleId: 'role-cash',
      pinHash: await bcrypt.hash('846201', 12),
    })
    const svc = makeService(db, FRESH)
    expect((await svc.verifyManagerPin('846201')).authorized).toBe(false)
  })

  it('refuses on a stale device and demands a sync', async () => {
    const svc = makeService(db, STALE)
    expect((await svc.verifyManagerPin('123456')).reason).toBe('STALE_DEVICE')
  })

  it('refuses when the device has never synced', async () => {
    const svc = makeService(db, () => null)
    expect((await svc.verifyManagerPin('123456')).reason).toBe('STALE_DEVICE')
  })

  it('rejects a malformed PIN as INVALID_FORMAT', async () => {
    const svc = makeService(db, FRESH)
    expect((await svc.verifyManagerPin('12345')).reason).toBe('INVALID_FORMAT')
    expect((await svc.verifyManagerPin('abcd')).reason).toBe('INVALID_FORMAT')
  })
})

describe('PinService.setPin', () => {
  it('hashes locally, sends the hash, and writes a verifiable local row', async () => {
    const db = createTestDatabase()
    seedMember(db, { id: 'm-self', userId: 'u-self', role: 'MANAGER', pinHash: null })

    let sentHash: string | null = null
    const patch: PatchFn = async (_url, body) => {
      sentHash = (body as { pinHash: string }).pinHash
      return { data: { data: { memberId: 'm-self', pinVersion: 3, pinSetAt: FRESH() } } } as never
    }
    const svc = new PinService(
      { patch },
      db,
      () => ({ businessId: BIZ, userId: 'u-self' }),
      FRESH,
      noopAudit,
    )

    const { pinVersion } = await svc.setPin('246810')
    expect(pinVersion).toBe(3)
    // The server received a bcrypt hash, never the plaintext PIN.
    expect(sentHash).toMatch(/^\$2[aby]\$/)
    expect(sentHash).not.toContain('246810')

    const row = db.get<{ pin_hash: string; pin_version: number }>(
      'SELECT pin_hash, pin_version FROM business_members WHERE user_id = ?',
      ['u-self'],
    )
    expect(row?.pin_version).toBe(3)
    expect(await bcrypt.compare('246810', row!.pin_hash)).toBe(true)
  })

  it('rejects a malformed or weak PIN before any network call', async () => {
    const db = createTestDatabase()
    let called = false
    const patch: PatchFn = async () => {
      called = true
      return { data: { data: { memberId: 'x', pinVersion: 1, pinSetAt: FRESH() } } } as never
    }
    const svc = new PinService(
      { patch },
      db,
      () => ({ businessId: BIZ, userId: 'u-self' }),
      FRESH,
      noopAudit,
    )
    await expect(svc.setPin('12')).rejects.toThrow(/too easy to guess/) // too short
    await expect(svc.setPin('111111')).rejects.toThrow(/too easy to guess/) // repeated
    await expect(svc.setPin('123456')).rejects.toThrow(/too easy to guess/) // sequential
    expect(called).toBe(false)
  })
})

describe('PinService step-up rate limiting', () => {
  let db: DatabaseService
  beforeEach(async () => {
    db = createTestDatabase()
    seedMember(db, {
      id: 'm-mgr',
      userId: 'u-mgr',
      role: 'MANAGER',
      name: 'Mercy Manager',
      pinHash: await bcrypt.hash('123456', 12),
    })
  })

  it('reports attempts remaining and audits each failure', async () => {
    const audit = new RecordingAudit()
    const svc = makeService(db, FRESH, audit)
    expect((await svc.verifyManagerPin('000000')).attemptsRemaining).toBe(4)
    expect((await svc.verifyManagerPin('000000')).attemptsRemaining).toBe(3)
    expect(audit.actions()).toEqual(['PIN_FAILED', 'PIN_FAILED'])
  })

  it('locks the device after 5 failures and logs PIN_LOCKED', async () => {
    const audit = new RecordingAudit()
    const svc = makeService(db, FRESH, audit)
    for (let i = 0; i < 4; i++) await svc.verifyManagerPin('000000')
    const fifth = await svc.verifyManagerPin('000000')
    expect(fifth.reason).toBe('LOCKED_OUT')
    expect(fifth.lockedUntil).toBeTruthy()
    // Even the correct PIN is refused while locked out.
    expect((await svc.verifyManagerPin('123456')).reason).toBe('LOCKED_OUT')
    expect(audit.actions()).toEqual([
      'PIN_FAILED',
      'PIN_FAILED',
      'PIN_FAILED',
      'PIN_FAILED',
      'PIN_FAILED',
      'PIN_LOCKED',
    ])
  })

  it('resets the failure count after a correct PIN', async () => {
    const svc = makeService(db, FRESH)
    await svc.verifyManagerPin('000000')
    await svc.verifyManagerPin('000000')
    expect((await svc.verifyManagerPin('123456')).authorized).toBe(true)
    // Counter was reset — a later failure starts from 4 remaining again.
    expect((await svc.verifyManagerPin('000000')).attemptsRemaining).toBe(4)
  })
})
