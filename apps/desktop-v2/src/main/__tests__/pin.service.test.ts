import bcrypt from 'bcryptjs'
import { beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseService } from '@biztrack/electron-core'
import { createTestDatabase } from '@biztrack/electron-core/testing'
import { PinService, type PinContext } from '../services/pin.service'

const BIZ = 'biz-1'
const FRESH = () => new Date().toISOString()
const STALE = () => new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString()

function seedMember(
  db: DatabaseService,
  opts: { id: string; userId: string; role: string; name?: string; pinHash?: string | null },
): void {
  db.run(
    `INSERT INTO business_members
       (id, business_id, user_id, role, status, name, is_deleted, created_at, updated_at, pin_hash, pin_version)
     VALUES (?, ?, ?, ?, 'ACTIVE', ?, 0, ?, ?, ?, ?)`,
    [
      opts.id,
      BIZ,
      opts.userId,
      opts.role,
      opts.name ?? null,
      FRESH(),
      FRESH(),
      opts.pinHash ?? null,
      opts.pinHash ? 1 : 0,
    ],
  )
}

type PatchFn = <T>(url: string, body?: unknown) => Promise<{ data: T }>
const defaultPatch: PatchFn = async () =>
  ({ data: { data: { memberId: 'm-self', pinVersion: 1, pinSetAt: FRESH() } } }) as never

/** A PinService wired to a live in-memory DB, a fixed context, and a sync clock. */
function makeService(
  db: DatabaseService,
  getLastSyncAt: () => string | null,
  context: PinContext = { businessId: BIZ, userId: 'u-self' },
): PinService {
  return new PinService({ patch: defaultPatch }, db, () => context, getLastSyncAt)
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
      pinHash: await bcrypt.hash('1234', 10),
    })
  })

  it('authorizes a correct manager PIN and identifies the authorizer', async () => {
    const svc = makeService(db, FRESH)
    const result = await svc.verifyManagerPin('1234')
    expect(result.authorized).toBe(true)
    expect(result.authorizedByUserId).toBe('u-mgr')
    expect(result.authorizedByName).toBe('Mercy Manager')
  })

  it('rejects a wrong PIN as NO_MATCH without naming a manager', async () => {
    const svc = makeService(db, FRESH)
    const result = await svc.verifyManagerPin('9999')
    expect(result).toEqual({
      authorized: false,
      reason: 'NO_MATCH',
      authorizedByUserId: null,
      authorizedByName: null,
    })
  })

  it('does not accept a cashier PIN (role-gated to OWNER/MANAGER)', async () => {
    seedMember(db, {
      id: 'm-cash',
      userId: 'u-cash',
      role: 'CASHIER',
      pinHash: await bcrypt.hash('4321', 10),
    })
    const svc = makeService(db, FRESH)
    expect((await svc.verifyManagerPin('4321')).authorized).toBe(false)
  })

  it('ignores managers with no PIN set', async () => {
    seedMember(db, { id: 'm-mgr2', userId: 'u-mgr2', role: 'MANAGER', pinHash: null })
    const svc = makeService(db, FRESH)
    // The only matching PIN belongs to the seeded manager; the PIN-less one is skipped.
    expect((await svc.verifyManagerPin('1234')).authorizedByUserId).toBe('u-mgr')
  })

  it('refuses on a stale device and demands a sync', async () => {
    const svc = makeService(db, STALE)
    expect((await svc.verifyManagerPin('1234')).reason).toBe('STALE_DEVICE')
  })

  it('refuses when the device has never synced', async () => {
    const svc = makeService(db, () => null)
    expect((await svc.verifyManagerPin('1234')).reason).toBe('STALE_DEVICE')
  })

  it('rejects a malformed PIN as INVALID_FORMAT', async () => {
    const svc = makeService(db, FRESH)
    expect((await svc.verifyManagerPin('12')).reason).toBe('INVALID_FORMAT')
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
    const svc = new PinService({ patch }, db, () => ({ businessId: BIZ, userId: 'u-self' }), FRESH)

    const { pinVersion } = await svc.setPin('2468')
    expect(pinVersion).toBe(3)
    // The server received a bcrypt hash, never the plaintext PIN.
    expect(sentHash).toMatch(/^\$2[aby]\$/)
    expect(sentHash).not.toContain('2468')

    const row = db.get<{ pin_hash: string; pin_version: number }>(
      'SELECT pin_hash, pin_version FROM business_members WHERE user_id = ?',
      ['u-self'],
    )
    expect(row?.pin_version).toBe(3)
    expect(await bcrypt.compare('2468', row!.pin_hash)).toBe(true)
  })

  it('rejects a non-numeric or too-short PIN before any network call', async () => {
    const db = createTestDatabase()
    let called = false
    const patch: PatchFn = async () => {
      called = true
      return { data: { data: { memberId: 'x', pinVersion: 1, pinSetAt: FRESH() } } } as never
    }
    const svc = new PinService({ patch }, db, () => ({ businessId: BIZ, userId: 'u-self' }), FRESH)
    await expect(svc.setPin('12')).rejects.toThrow(/4 to 8 digits/)
    expect(called).toBe(false)
  })
})
