import { beforeEach, describe, expect, it } from 'vitest'
import { CashSessionStatus } from '@biztrack/types'
import type { DatabaseService } from '@biztrack/electron-core'
import { createTestDatabase } from '@biztrack/electron-core/testing'
import { CashSessionsService } from '../services/cash-sessions.service'

const BIZ = 'biz-1'
const USER = 'u-1'
const DEVICE = 'device-1'

function makeService(db: DatabaseService, businessId: string | null = BIZ): CashSessionsService {
  return new CashSessionsService(
    db,
    () => businessId,
    () => USER,
    () => DEVICE,
  )
}

describe('CashSessionsService', () => {
  let db: DatabaseService
  beforeEach(() => {
    db = createTestDatabase()
  })

  it('opens a session with a whole-XAF float and enqueues it to the outbox', () => {
    const svc = makeService(db)
    const session = svc.openSession({ openingFloat: 5000 })

    expect(session.status).toBe(CashSessionStatus.OPEN)
    expect(session.openingFloat).toBe(5000)
    expect(session.deviceId).toBe(DEVICE)
    expect(session.userId).toBe(USER)

    const outbox = db.get<{ entity: string; record_id: string }>(
      `SELECT entity, record_id FROM sync_outbox WHERE record_id = ?`,
      [session.id],
    )
    expect(outbox?.entity).toBe('cashSessions')
  })

  it('rounds a fractional opening float to whole XAF', () => {
    const svc = makeService(db)
    const session = svc.openSession({ openingFloat: 100.7 })
    expect(session.openingFloat).toBe(101)
  })

  it("returns the till's live session as current, and refuses a second open", () => {
    const svc = makeService(db)
    const opened = svc.openSession({ openingFloat: 1000 })

    const current = svc.getCurrent()
    expect(current?.id).toBe(opened.id)

    expect(() => svc.openSession({ openingFloat: 2000 })).toThrow(/already open/i)
  })

  it('walks OPEN → COUNTING → CLOSED, then locks the closed session', () => {
    const svc = makeService(db)
    const opened = svc.openSession({ openingFloat: 0 })

    const counting = svc.transition(opened.id, { status: CashSessionStatus.COUNTING })
    expect(counting.status).toBe(CashSessionStatus.COUNTING)

    const closed = svc.transition(opened.id, {
      status: CashSessionStatus.CLOSED,
      closingNote: 'end of day',
    })
    expect(closed.status).toBe(CashSessionStatus.CLOSED)
    expect(closed.closedAt).toBeTruthy()
    expect(closed.closingNote).toBe('end of day')

    // A closed session is immutable to every role.
    expect(() => svc.transition(opened.id, { status: CashSessionStatus.RECONCILED })).toThrow(
      /closed/i,
    )
  })

  it('rejects an illegal transition (OPEN → RECONCILED)', () => {
    const svc = makeService(db)
    const opened = svc.openSession({ openingFloat: 0 })
    expect(() => svc.transition(opened.id, { status: CashSessionStatus.RECONCILED })).toThrow(
      /cannot move/i,
    )
  })

  it('after close, the till has no live session so a new one can open', () => {
    const svc = makeService(db)
    const first = svc.openSession({ openingFloat: 0 })
    svc.transition(first.id, { status: CashSessionStatus.CLOSED })

    expect(svc.getCurrent()).toBeNull()
    const second = svc.openSession({ openingFloat: 0 })
    expect(second.id).not.toBe(first.id)
  })

  it('lists sessions for the business, newest first, filterable by status', () => {
    const svc = makeService(db)
    const a = svc.openSession({ openingFloat: 0 })
    svc.transition(a.id, { status: CashSessionStatus.CLOSED })
    svc.openSession({ openingFloat: 0 })

    const all = svc.list()
    expect(all.total).toBe(2)

    const open = svc.list({ status: CashSessionStatus.OPEN })
    expect(open.total).toBe(1)
    expect(open.data[0].status).toBe(CashSessionStatus.OPEN)
  })

  it('rejects a non-whole money write at the DB guard', () => {
    // The service always rounds, so poke the trigger directly to prove it guards.
    const now = new Date().toISOString()
    expect(() =>
      db.run(
        `INSERT INTO cash_sessions
          (id, business_id, device_id, user_id, status, opened_at, opening_float, credit_issued,
           discount_total, sales_count, void_count, recount_used, is_deleted, created_at, updated_at)
         VALUES ('x', ?, ?, ?, 'OPEN', ?, 100.5, 0, 0, 0, 0, 0, 0, ?, ?)`,
        [BIZ, DEVICE, USER, now, now, now],
      ),
    ).toThrow(/whole XAF/i)
  })
})
