import { beforeEach, describe, expect, it } from 'vitest'
import { CashMovementKind, CashSessionStatus } from '@biztrack/types'
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
    expect(open.data[0]?.status).toBe(CashSessionStatus.OPEN)
  })

  it('computes expected cash: float + cash taken − change given (BIZ-2.2)', () => {
    const svc = makeService(db)
    const session = svc.openSession({ openingFloat: 10000 })
    const now = new Date().toISOString()

    // Two COMPLETED cash sales tagged to the session, both discounted (heavy-discount
    // AC): the cash tendered is already net of the discount.
    //   A: total 4500, tendered 5000 cash, change 500 → net 4500
    //   B: total 3000, tendered 3000 cash, change 0   → net 3000
    const addCashSale = (id: string, total: number, tendered: number, change: number): void => {
      db.run(
        `INSERT INTO sales
          (id, business_id, client_id, cashier_id, sale_number, receipt_number, subtotal,
           total_amount, discount_amount, charges_amount, tax_amount, net_amount, amount_paid,
           credit_amount, change_given, payment_method, currency, sale_date, sold_at,
           cash_session_id, status, is_deleted, created_at, updated_at)
         VALUES (?, ?, ?, 'u-1', ?, ?, ?, ?, 0, 0, 0, ?, ?, 0, ?, 'CASH', 'XAF', ?, ?, ?, 'COMPLETED', 0, ?, ?)`,
        [
          id,
          BIZ,
          id,
          id,
          id,
          total,
          total,
          total,
          tendered,
          change,
          now.slice(0, 10),
          now,
          session.id,
          now,
          now,
        ],
      )
      db.run(
        `INSERT INTO sale_payments (id, sale_id, business_id, method, amount, created_at)
         VALUES (?, ?, ?, 'CASH', ?, ?)`,
        [`p-${id}`, id, BIZ, tendered, now],
      )
    }
    addCashSale('sale-a', 4500, 5000, 500)
    addCashSale('sale-b', 3000, 3000, 0)

    const result = svc.expectedCash(session.id)
    expect(result).not.toBeNull()
    expect(result?.openingFloat).toBe(10000)
    expect(result?.cashPayments).toBe(8000)
    expect(result?.changeGiven).toBe(500)
    // 10000 + 8000 − 500 = 17500, despite 2500 XAF of discounts.
    expect(result?.expectedCash).toBe(17500)
  })

  it('excludes a non-CASH sale and an untagged sale from expected cash', () => {
    const svc = makeService(db)
    const session = svc.openSession({ openingFloat: 5000 })
    const now = new Date().toISOString()
    const addSale = (
      id: string,
      method: string,
      amount: number,
      sessionId: string | null,
    ): void => {
      db.run(
        `INSERT INTO sales
          (id, business_id, client_id, cashier_id, sale_number, receipt_number, subtotal,
           total_amount, discount_amount, charges_amount, tax_amount, net_amount, amount_paid,
           credit_amount, change_given, payment_method, currency, sale_date, sold_at,
           cash_session_id, status, is_deleted, created_at, updated_at)
         VALUES (?, ?, ?, 'u-1', ?, ?, ?, ?, 0, 0, 0, ?, ?, 0, 0, ?, 'XAF', ?, ?, ?, 'COMPLETED', 0, ?, ?)`,
        [
          id,
          BIZ,
          id,
          id,
          id,
          amount,
          amount,
          amount,
          amount,
          method,
          now.slice(0, 10),
          now,
          sessionId,
          now,
          now,
        ],
      )
      db.run(
        `INSERT INTO sale_payments (id, sale_id, business_id, method, amount, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [`p-${id}`, id, BIZ, method, amount, now],
      )
    }
    addSale('cash-in', 'CASH', 2000, session.id) // counts
    addSale('momo-in', 'MTN_MOMO', 9000, session.id) // not cash → excluded
    addSale('cash-out', 'CASH', 7000, null) // untagged → excluded

    const result = svc.expectedCash(session.id)
    expect(result?.cashPayments).toBe(2000)
    expect(result?.expectedCash).toBe(7000) // 5000 float + 2000 cash
  })

  it('records cash movements and folds them into expected cash (BIZ-2.3)', () => {
    const svc = makeService(db)
    const session = svc.openSession({ openingFloat: 10000 })

    const draw = svc.recordMovement({ kind: CashMovementKind.OWNER_DRAW, amount: 3000 })
    expect(draw.direction).toBe('OUT')
    svc.recordMovement({ kind: CashMovementKind.CREDIT_REPAYMENT, amount: 1500 }) // cash IN

    const outbox = db.get<{ entity: string }>(
      `SELECT entity FROM sync_outbox WHERE record_id = ?`,
      [draw.id],
    )
    expect(outbox?.entity).toBe('cashMovements')

    // 10000 float − 3000 owner draw + 1500 repayment = 8500 (no sales).
    const result = svc.expectedCash(session.id)
    expect(result?.cashOut).toBe(3000)
    expect(result?.cashIn).toBe(1500)
    expect(result?.expectedCash).toBe(8500)

    expect(svc.listMovements(session.id)).toHaveLength(2)
  })

  it('closes a shift with a blind count and computes the variance (BIZ-2.4)', () => {
    const svc = makeService(db)
    const session = svc.openSession({ openingFloat: 10000 })
    svc.recordMovement({ kind: CashMovementKind.OWNER_DRAW, amount: 2000 }) // expected = 8000

    // Count exactly 8 000 → zero variance.
    const closed = svc.closeSession(session.id, {
      counts: [
        { denomination: 5000, quantity: 1 },
        { denomination: 2000, quantity: 1 },
        { denomination: 1000, quantity: 1 },
      ],
    })
    expect(closed.status).toBe(CashSessionStatus.CLOSED)
    expect(closed.expectedCash).toBe(8000)
    expect(closed.countedCash).toBe(8000)
    expect(closed.varianceCash).toBe(0)
    expect(closed.closedAt).toBeTruthy()

    // Count lines persisted.
    const lines = db.query(
      `SELECT denomination, quantity FROM cash_count_lines WHERE cash_session_id = ?`,
      [session.id],
    )
    expect(lines).toHaveLength(3)

    // A closed shift can't be closed again.
    expect(() => svc.closeSession(session.id, { counts: [] })).toThrow(/already closed/i)
  })

  it('flags a short drawer as a negative variance', () => {
    const svc = makeService(db)
    const session = svc.openSession({ openingFloat: 10000 })
    const closed = svc.closeSession(session.id, {
      counts: [
        { denomination: 5000, quantity: 1 },
        { denomination: 2000, quantity: 2 },
      ], // 9 000
    })
    expect(closed.varianceCash).toBe(-1000) // counted 9 000 vs expected 10 000
  })

  it('refuses a movement when no shift is open', () => {
    const svc = makeService(db)
    expect(() => svc.recordMovement({ kind: CashMovementKind.OWNER_DRAW, amount: 1000 })).toThrow(
      /open a cash session/i,
    )
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
