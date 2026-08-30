import { beforeEach, describe, expect, it } from 'vitest'
import { CashMovementKind, CashSessionStatus, CashVarianceReason } from '@biztrack/types'
import type { DatabaseService } from '@biztrack/electron-core'
import { createTestDatabase } from '@biztrack/electron-core/testing'
import { CashSessionsService } from '../services/cash-sessions.service'

const BIZ = 'biz-1'
const USER = 'u-1'
const DEVICE = 'device-1'

interface AuditEntryLite {
  action: string
  entityType: string
  amount?: number | null
}
class RecordingAudit {
  entries: AuditEntryLite[] = []
  log(entry: AuditEntryLite): void {
    this.entries.push(entry)
  }
}

function makeService(
  db: DatabaseService,
  businessId: string | null = BIZ,
  audit?: RecordingAudit,
): CashSessionsService {
  return new CashSessionsService(
    db,
    () => businessId,
    () => USER,
    () => DEVICE,
    () => {},
    audit,
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

  it('nets a REFUND-kind cash payment out of expected cash and keeps the refunded sale (BIZ-1.8)', () => {
    const svc = makeService(db)
    const session = svc.openSession({ openingFloat: 10000 })
    const now = new Date().toISOString()

    // A cash sale of 5000, then a 2000 partial refund → status PARTIALLY_REFUNDED.
    db.run(
      `INSERT INTO sales
        (id, business_id, client_id, cashier_id, sale_number, receipt_number, subtotal,
         total_amount, discount_amount, charges_amount, tax_amount, net_amount, amount_paid,
         credit_amount, change_given, payment_method, currency, sale_date, sold_at,
         cash_session_id, status, is_deleted, created_at, updated_at)
       VALUES (?, ?, ?, 'u-1', ?, ?, 5000, 5000, 0, 0, 0, 5000, 3000, 0, 0, 'CASH', 'XAF', ?, ?, ?, 'PARTIALLY_REFUNDED', 0, ?, ?)`,
      ['ref-a', BIZ, 'ref-a', 'ref-a', 'ref-a', now.slice(0, 10), now, session.id, now, now],
    )
    db.run(
      `INSERT INTO sale_payments (id, sale_id, business_id, method, amount, kind, created_at)
       VALUES (?, ?, ?, 'CASH', 5000, 'PAYMENT', ?)`,
      ['p-ref-a', 'ref-a', BIZ, now],
    )
    db.run(
      `INSERT INTO sale_payments (id, sale_id, business_id, method, amount, kind, created_at)
       VALUES (?, ?, ?, 'CASH', 2000, 'REFUND', ?)`,
      ['r-ref-a', 'ref-a', BIZ, now],
    )

    const result = svc.expectedCash(session.id)
    // Original 5000 tender still counts (refunded ≠ voided); the 2000 refund nets out.
    expect(result?.cashPayments).toBe(3000)
    expect(result?.expectedCash).toBe(13000) // 10000 float + 5000 − 2000
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

  it('auto-records a cash movement from another flow (debt/expense paid in cash)', () => {
    const svc = makeService(db)
    const session = svc.openSession({ openingFloat: 10000 })

    // A customer settling a receivable in cash → cash IN.
    const inMv = svc.recordAutoMovement({
      kind: CashMovementKind.CREDIT_REPAYMENT,
      amount: 3000,
      referenceType: 'debt',
      referenceId: 'debt-1',
    })
    expect(inMv?.direction).toBe('IN')
    // Paying a supplier payable in cash → cash OUT.
    svc.recordAutoMovement({ kind: CashMovementKind.SUPPLIER_PAYMENT, amount: 1000 })

    const result = svc.expectedCash(session.id)
    expect(result?.cashIn).toBe(3000)
    expect(result?.cashOut).toBe(1000)
    expect(result?.expectedCash).toBe(12000) // 10000 + 3000 − 1000
  })

  it('auto-record is a no-op when no shift is open', () => {
    const svc = makeService(db)
    expect(
      svc.recordAutoMovement({ kind: CashMovementKind.CREDIT_REPAYMENT, amount: 3000 }),
    ).toBeNull()
  })

  it('emits SHIFT_OPENED / CASH_MOVEMENT / SHIFT_CLOSED to the audit log (BIZ-2.9)', () => {
    const audit = new RecordingAudit()
    const svc = makeService(db, BIZ, audit)
    const session = svc.openSession({ openingFloat: 10000 })
    svc.recordMovement({ kind: CashMovementKind.OWNER_DRAW, amount: 2000 }) // expected = 8000
    svc.closeSession(session.id, {
      counts: [
        { denomination: 5000, quantity: 1 },
        { denomination: 2000, quantity: 1 },
        { denomination: 1000, quantity: 1 },
      ], // 8 000 → zero variance
    })

    expect(audit.entries.map((e) => e.action)).toEqual([
      'SHIFT_OPENED',
      'CASH_MOVEMENT',
      'SHIFT_CLOSED',
    ])
    expect(audit.entries[0]?.amount).toBe(10000) // opening float
    expect(audit.entries[1]?.amount).toBe(2000) // movement
    expect(audit.entries[2]?.amount).toBe(8000) // counted cash
  })

  it('refuses a movement when no shift is open', () => {
    const svc = makeService(db)
    expect(() => svc.recordMovement({ kind: CashMovementKind.OWNER_DRAW, amount: 1000 })).toThrow(
      /open a cash session/i,
    )
  })

  it('offers an orphaned shift for recovery and closes it as RECOVERED, count unknown (BIZ-2.5)', () => {
    const svc = makeService(db)
    const s = svc.openSession({ openingFloat: 5000 })
    expect(svc.findStaleOpenSession()).toBeNull() // just opened → not stale

    // Backdate the open time to 20h ago (past the 16h default window).
    const old = new Date(Date.now() - 20 * 3_600_000).toISOString()
    db.run(`UPDATE cash_sessions SET opened_at = ? WHERE id = ?`, [old, s.id])
    expect(svc.findStaleOpenSession()?.id).toBe(s.id)

    const closed = svc.recoverAndClose(s.id)
    expect(closed.status).toBe(CashSessionStatus.CLOSED)
    expect(closed.closedReason).toBe('RECOVERED')
    expect(closed.countedCash).toBeNull() // never counted → no fabricated variance
    expect(closed.varianceCash).toBeNull()
    expect(svc.getCurrent()).toBeNull() // a fresh shift can now open
  })

  it('records a variance reason on an out-of-tolerance close (BIZ-2.6)', () => {
    const svc = makeService(db)
    const s = svc.openSession({ openingFloat: 10000 })
    // Count 9 500 vs expected 10 000 → −500 variance (beyond the ±100 band).
    const closed = svc.closeSession(s.id, {
      counts: [
        { denomination: 5000, quantity: 1 },
        { denomination: 2000, quantity: 2 },
        { denomination: 500, quantity: 1 },
      ],
    })
    expect(closed.varianceCash).toBe(-500)

    const reasoned = svc.setVarianceReason(s.id, {
      reason: CashVarianceReason.CHANGE_ERROR,
      note: 'gave wrong change',
    })
    expect(reasoned.varianceReason).toBe('CHANGE_ERROR')
    expect(reasoned.varianceNote).toBe('gave wrong change')
  })

  it('aggregates per-cashier variance history, ranked worst-first, excluding uncounted/old (BIZ-2.6)', () => {
    const svc = makeService(db)
    const now = Date.now()
    const iso = (msAgo: number): string => new Date(now - msAgo).toISOString()

    const member = (userId: string, name: string): void => {
      db.run(
        `INSERT INTO business_members (id, business_id, user_id, role, status, name, is_deleted, created_at, updated_at)
         VALUES (?, ?, ?, 'CASHIER', 'ACTIVE', ?, 0, ?, ?)`,
        [`bm-${userId}`, BIZ, userId, name, iso(0), iso(0)],
      )
    }
    // variance null → a RECOVERED/uncounted shift that must be excluded.
    const shift = (
      id: string,
      userId: string,
      variance: number | null,
      closedAt: string,
      reason = 'NORMAL',
    ): void => {
      const counted = variance === null ? null : 10000 + variance
      db.run(
        `INSERT INTO cash_sessions
          (id, business_id, device_id, user_id, status, opened_at, closed_at, opening_float,
           expected_cash, counted_cash, variance_cash, closed_reason, credit_issued, discount_total,
           sales_count, void_count, recount_used, is_deleted, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'CLOSED', ?, ?, 10000, 10000, ?, ?, ?, 0, 0, 0, 0, 0, 0, ?, ?)`,
        [
          id,
          BIZ,
          DEVICE,
          userId,
          closedAt,
          closedAt,
          counted,
          variance,
          reason,
          closedAt,
          closedAt,
        ],
      )
    }

    member('u-alice', 'Alice')
    member('u-bob', 'Bob')
    // Alice: 0, +200, −50 → 3 shifts, 1 outside ±100, mean 50, net 150, |Σ| 250, worst +200.
    shift('a1', 'u-alice', 0, iso(1 * 86_400_000))
    shift('a2', 'u-alice', 200, iso(2 * 86_400_000))
    shift('a3', 'u-alice', -50, iso(3 * 86_400_000))
    // Bob: −500, 0 → 2 shifts, 1 outside, mean −250, |Σ| 500, worst −500.
    shift('b1', 'u-bob', -500, iso(1 * 86_400_000))
    shift('b2', 'u-bob', 0, iso(2 * 86_400_000))
    // Excluded: Alice recovered (variance null) + Bob shift older than the 30d window.
    shift('a4', 'u-alice', null, iso(1 * 86_400_000), 'RECOVERED')
    shift('b3', 'u-bob', 9999, iso(40 * 86_400_000))

    const hist = svc.varianceHistory()
    expect(hist.toleranceXaf).toBe(100)
    expect(hist.cashiers).toHaveLength(2)

    // Ranked worst-first by total drawer error → Bob (500) before Alice (250).
    const [bob, alice] = hist.cashiers
    expect(bob?.userId).toBe('u-bob')
    expect(bob?.cashierName).toBe('Bob')
    expect(bob?.shifts).toBe(2)
    expect(bob?.sumAbsVarianceCash).toBe(500)
    expect(bob?.meanVarianceCash).toBe(-250)
    expect(bob?.outsideToleranceCount).toBe(1)
    expect(bob?.pctOutsideTolerance).toBe(50)
    expect(bob?.worstShift?.sessionId).toBe('b1')
    expect(bob?.worstShift?.varianceCash).toBe(-500)

    expect(alice?.userId).toBe('u-alice')
    expect(alice?.shifts).toBe(3) // the recovered shift is excluded
    expect(alice?.sumAbsVarianceCash).toBe(250)
    expect(alice?.meanVarianceCash).toBe(50)
    expect(alice?.netVarianceCash).toBe(150)
    expect(alice?.outsideToleranceCount).toBe(1)
    expect(alice?.pctOutsideTolerance).toBe(33)
    expect(alice?.worstShift?.varianceCash).toBe(200)
  })

  it('builds an X-report (mid-shift read) then a Z-report (close) with tenders + drawer (BIZ-2.6)', () => {
    const svc = makeService(db)
    const session = svc.openSession({ openingFloat: 10000 })
    const now = new Date().toISOString()

    const addSale = (
      id: string,
      o: {
        subtotal: number
        total: number
        discount: number
        method: string
        tendered: number
        change: number
      },
    ): void => {
      db.run(
        `INSERT INTO sales
          (id, business_id, client_id, cashier_id, sale_number, receipt_number, subtotal,
           total_amount, discount_amount, charges_amount, tax_amount, net_amount, amount_paid,
           credit_amount, change_given, payment_method, currency, sale_date, sold_at,
           cash_session_id, status, is_deleted, created_at, updated_at)
         VALUES (?, ?, ?, 'u-1', ?, ?, ?, ?, ?, 0, 0, ?, ?, 0, ?, ?, 'XAF', ?, ?, ?, 'COMPLETED', 0, ?, ?)`,
        [
          id,
          BIZ,
          id,
          id,
          id,
          o.subtotal,
          o.total,
          o.discount,
          o.total,
          o.tendered,
          o.change,
          o.method,
          now.slice(0, 10),
          now,
          session.id,
          now,
          now,
        ],
      )
      db.run(
        `INSERT INTO sale_payments (id, sale_id, business_id, method, amount, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [`p-${id}`, id, BIZ, o.method, o.tendered, now],
      )
    }
    // Cash sale: subtotal 5 000, 500 discount → total 4 500, tendered 5 000, change 500.
    addSale('s-cash', {
      subtotal: 5000,
      total: 4500,
      discount: 500,
      method: 'CASH',
      tendered: 5000,
      change: 500,
    })
    // MoMo sale: 3 000 (no cash impact, but shows in the tender mix).
    addSale('s-momo', {
      subtotal: 3000,
      total: 3000,
      discount: 0,
      method: 'MTN_MOMO',
      tendered: 3000,
      change: 0,
    })
    svc.recordMovement({ kind: CashMovementKind.OWNER_DRAW, amount: 2000 }) // cash OUT

    const x = svc.shiftReport(session.id, 'X')
    expect(x?.kind).toBe('X')
    expect(x?.sales.count).toBe(2)
    expect(x?.sales.grossSales).toBe(8000) // subtotals 5 000 + 3 000
    expect(x?.sales.discountTotal).toBe(500)
    expect(x?.sales.netSales).toBe(7500) // totals 4 500 + 3 000
    expect(x?.tenders.cash).toBe(5000)
    expect(x?.tenders.mtnMomo).toBe(3000)
    // 10 000 float + 5 000 cash − 500 change − 2 000 draw = 12 500.
    expect(x?.drawer.expectedCash).toBe(12500)
    expect(x?.drawer.countedCash).toBeNull() // blind until close
    expect(x?.drawer.varianceCash).toBeNull()
    expect(x?.movements).toHaveLength(1)
    expect(x?.movements[0]?.direction).toBe('OUT')

    // Close with an exact 12 500 count → Z-report with zero variance.
    svc.closeSession(session.id, {
      counts: [
        { denomination: 10000, quantity: 1 },
        { denomination: 2000, quantity: 1 },
        { denomination: 500, quantity: 1 },
      ],
    })
    const z = svc.shiftReport(session.id, 'Z')
    expect(z?.kind).toBe('Z')
    expect(z?.drawer.expectedCash).toBe(12500)
    expect(z?.drawer.countedCash).toBe(12500)
    expect(z?.drawer.varianceCash).toBe(0)
    expect(z?.momo.expectedMtn).toBe(3000)
  })

  it('rolls up the day’s shifts into a daily close (no reconciliation on device) (BIZ-2.6)', () => {
    const svc = makeService(db)
    const session = svc.openSession({ openingFloat: 10000 })
    const now = new Date().toISOString()
    db.run(
      `INSERT INTO sales
        (id, business_id, client_id, cashier_id, sale_number, receipt_number, subtotal,
         total_amount, discount_amount, charges_amount, tax_amount, net_amount, amount_paid,
         credit_amount, change_given, payment_method, currency, sale_date, sold_at,
         cash_session_id, status, is_deleted, created_at, updated_at)
       VALUES ('d-sale', ?, 'c', 'u-1', 'd-sale', 'd-sale', 4000, 4000, 0, 0, 0, 4000, 4000, 0, 0, 'CASH', 'XAF', ?, ?, ?, 'COMPLETED', 0, ?, ?)`,
      [BIZ, now.slice(0, 10), now, session.id, now, now],
    )
    db.run(
      `INSERT INTO sale_payments (id, sale_id, business_id, method, amount, created_at)
       VALUES ('p-d', 'd-sale', ?, 'CASH', 4000, ?)`,
      [BIZ, now],
    )
    // Close counting 14 000 (10 000 float + 4 000 cash) → zero variance.
    svc.closeSession(session.id, {
      counts: [
        { denomination: 10000, quantity: 1 },
        { denomination: 2000, quantity: 2 },
      ],
    })

    const daily = svc.dailyReport()
    expect(daily.totals.shifts).toBe(1)
    expect(daily.totals.salesCount).toBe(1)
    expect(daily.totals.cash).toBe(4000)
    expect(daily.totals.netSales).toBe(4000)
    expect(daily.totals.openingFloat).toBe(10000)
    expect(daily.totals.expectedCash).toBe(14000)
    expect(daily.totals.countedCash).toBe(14000)
    expect(daily.totals.varianceCash).toBe(0)
    expect(daily.shifts).toHaveLength(1)
    expect(daily.shifts[0]?.sessionId).toBe(session.id)
    expect(daily.shifts[0]?.cashSales).toBe(4000)
    expect(daily.reconciliation).toBeNull() // the server reconciles vs daily_sale_summaries
  })

  it('rejects a variance reason on a shift that is not closed', () => {
    const svc = makeService(db)
    const s = svc.openSession({ openingFloat: 0 })
    expect(() => svc.setVarianceReason(s.id, { reason: CashVarianceReason.UNKNOWN })).toThrow(
      /just-closed/i,
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
