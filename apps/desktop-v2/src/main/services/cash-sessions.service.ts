import { randomUUID } from 'crypto'
import {
  CashSessionStatus,
  canTransitionCashSession,
  isCashSessionLocked,
  type CashSession,
  type CashSessionExpectedCash,
} from '@biztrack/types'
import { computeExpectedCash } from '@biztrack/utils'
import type { DatabaseService } from '@biztrack/electron-core'
import type {
  CashSessionsListQuery,
  OpenCashSessionInput,
  PaginatedResult,
  TransitionCashSessionInput,
} from '../../shared/ipc'
import { paginateRows, toPaginated } from './pagination'

interface SessionRow {
  id: string
  business_id: string
  outlet_id: string | null
  device_id: string
  user_id: string
  status: string
  opened_at: string
  closed_at: string | null
  opening_float: number
  expected_cash: number | null
  counted_cash: number | null
  variance_cash: number | null
  expected_mtn_momo: number | null
  confirmed_mtn_momo: number | null
  expected_orange_money: number | null
  confirmed_orange_money: number | null
  credit_issued: number
  discount_total: number
  sales_count: number
  void_count: number
  closed_reason: string | null
  recount_used: number
  closing_note: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string | null
  created_at: string
  updated_at: string
}

const COLS = `id, business_id, outlet_id, device_id, user_id, status, opened_at, closed_at,
  opening_float, expected_cash, counted_cash, variance_cash, expected_mtn_momo, confirmed_mtn_momo,
  expected_orange_money, confirmed_orange_money, credit_issued, discount_total, sales_count,
  void_count, closed_reason, recount_used, closing_note, reviewed_by, reviewed_at, review_note,
  created_at, updated_at`

/**
 * Offline-first cash sessions (BIZ-2.1) — a cashier's shift at a till. Open a session
 * with a float, transition it through OPEN → COUNTING → CLOSED → RECONCILED (+ ABANDONED)
 * guarded by the shared state machine, and every write pushes the full record to the
 * outbox (entity `cashSessions` → server `cash_session`). A CLOSED session is immutable
 * to every role. Expected-cash + the denomination-count close land in BIZ-2.2 / BIZ-2.4.
 */
export class CashSessionsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly getBusinessId: () => string | null,
    private readonly getUserId: () => string | null,
    private readonly getDeviceId: () => string,
    private readonly onMutated: () => void = () => {},
  ) {}

  /** This till's live session (OPEN or COUNTING), or null — drives the POS shift banner. */
  getCurrent(): CashSession | null {
    const businessId = this.getBusinessId()
    if (!businessId) return null
    const row = this.db.get<SessionRow>(
      `SELECT ${COLS} FROM cash_sessions
       WHERE business_id = ? AND device_id = ? AND status IN ('OPEN', 'COUNTING') AND is_deleted = 0
       ORDER BY opened_at DESC LIMIT 1`,
      [businessId, this.getDeviceId()],
    )
    return row ? toCashSession(row) : null
  }

  get(id: string): CashSession | null {
    const businessId = this.getBusinessId()
    if (!businessId) return null
    const row = this.db.get<SessionRow>(
      `SELECT ${COLS} FROM cash_sessions WHERE id = ? AND business_id = ? AND is_deleted = 0`,
      [id, businessId],
    )
    return row ? toCashSession(row) : null
  }

  list(query: CashSessionsListQuery = {}): PaginatedResult<CashSession> {
    const businessId = this.getBusinessId()
    if (!businessId)
      return toPaginated<CashSession>([], { total: 0, page: 1, limit: 20, totalPages: 1 })
    let where = 'business_id = ? AND is_deleted = 0'
    const params: unknown[] = [businessId]
    if (query.status) {
      where += ' AND status = ?'
      params.push(query.status)
    }
    const { rows, ...meta } = paginateRows<SessionRow>(
      this.db,
      {
        from: 'cash_sessions',
        columns: COLS,
        where,
        params,
        searchColumns: [],
        defaultSort: 'opened_at DESC',
        sortMap: { openedAt: 'opened_at', closedAt: 'closed_at' },
      },
      query,
    )
    return toPaginated(rows.map(toCashSession), meta)
  }

  /**
   * Expected-cash breakdown for a session (BIZ-2.2) — what the drawer should hold at
   * close. Cash movements (cashIn/cashOut) are 0 until BIZ-2.3 lands. Uses the shared
   * `computeExpectedCash` so the desktop and API agree by construction.
   */
  expectedCash(sessionId: string): CashSessionExpectedCash | null {
    const businessId = this.getBusinessId()
    if (!businessId) return null
    const session = this.get(sessionId)
    if (!session) return null

    const cash = this.db.get<{ v: number }>(
      `SELECT COALESCE(SUM(sp.amount), 0) AS v
       FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id
       WHERE s.cash_session_id = ? AND s.business_id = ? AND sp.method = 'CASH'
         AND s.status = 'COMPLETED' AND s.is_deleted = 0`,
      [sessionId, businessId],
    )
    const change = this.db.get<{ v: number }>(
      `SELECT COALESCE(SUM(s.change_given), 0) AS v
       FROM sales s
       WHERE s.cash_session_id = ? AND s.business_id = ? AND s.status = 'COMPLETED'
         AND s.is_deleted = 0`,
      [sessionId, businessId],
    )
    const cashPayments = cash?.v ?? 0
    const changeGiven = change?.v ?? 0
    const cashIn = 0 // BIZ-2.3
    const cashOut = 0 // BIZ-2.3
    return {
      sessionId,
      openingFloat: session.openingFloat,
      cashPayments,
      changeGiven,
      cashIn,
      cashOut,
      expectedCash: computeExpectedCash({
        openingFloat: session.openingFloat,
        cashPayments,
        changeGiven,
        cashIn,
        cashOut,
      }),
    }
  }

  /** Open a shift. Refuses a second live session on the same till. */
  openSession(input: OpenCashSessionInput = {}): CashSession {
    const businessId = this.getBusinessId()
    if (!businessId) throw new Error('No active business.')
    const deviceId = this.getDeviceId()

    const existing = this.getCurrent()
    if (existing) throw new Error('A cash session is already open on this device.')

    const id = input.id ?? randomUUID()
    const now = new Date().toISOString()
    const openingFloat = Math.round(input.openingFloat ?? 0)

    this.db.run(
      `INSERT INTO cash_sessions
        (id, business_id, device_id, user_id, status, opened_at, opening_float,
         credit_issued, discount_total, sales_count, void_count, recount_used,
         is_deleted, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'OPEN', ?, ?, 0, 0, 0, 0, 0, 0, ?, ?)`,
      [id, businessId, deviceId, this.getUserId(), now, openingFloat, now, now],
    )

    this.push(id, businessId)
    // Audit emit for SHIFT_OPENED is wired in BIZ-2.9 (broaden emit coverage).
    this.onMutated()
    return this.get(id) as CashSession
  }

  /** Move a session through its lifecycle. Rejects illegal or locked transitions. */
  transition(id: string, input: TransitionCashSessionInput): CashSession {
    const businessId = this.getBusinessId()
    if (!businessId) throw new Error('No active business.')
    const current = this.get(id)
    if (!current) throw new Error('Cash session not found.')

    if (isCashSessionLocked(current.status)) {
      throw new Error('This cash session is closed and can no longer be edited.')
    }
    if (!canTransitionCashSession(current.status, input.status)) {
      throw new Error(`Cannot move a cash session from ${current.status} to ${input.status}.`)
    }

    const now = new Date().toISOString()
    const closedAt = input.status === CashSessionStatus.CLOSED ? now : (current.closedAt ?? null)
    this.db.run(
      `UPDATE cash_sessions
       SET status = ?, closing_note = COALESCE(?, closing_note), closed_at = ?, updated_at = ?
       WHERE id = ? AND business_id = ?`,
      [input.status, input.closingNote ?? null, closedAt, now, id, businessId],
    )

    this.push(id, businessId)
    // Audit emit for SHIFT_CLOSED is wired in BIZ-2.9 (broaden emit coverage).
    this.onMutated()
    return this.get(id) as CashSession
  }

  /** Enqueue the full current session record to the outbox for push. */
  private push(id: string, businessId: string): void {
    const row = this.db.get<SessionRow>(
      `SELECT ${COLS} FROM cash_sessions WHERE id = ? AND business_id = ?`,
      [id, businessId],
    )
    if (!row) return
    const rec = toCashSession(row)
    const now = new Date().toISOString()
    this.db.run(
      `INSERT INTO sync_outbox (id, entity, record_id, operation, payload, status, attempt_count, created_at, updated_at)
       VALUES (?, 'cashSessions', ?, 'UPSERT', ?, 'pending', 0, ?, ?)
       ON CONFLICT(entity, record_id) DO UPDATE SET
         operation = excluded.operation, payload = excluded.payload, status = 'pending',
         attempt_count = 0, next_attempt_at = NULL, last_error = NULL, updated_at = excluded.updated_at`,
      [randomUUID(), id, JSON.stringify(rec), now, now],
    )
  }
}

function toCashSession(r: SessionRow): CashSession {
  return {
    id: r.id,
    businessId: r.business_id,
    outletId: r.outlet_id,
    deviceId: r.device_id,
    userId: r.user_id,
    status: r.status as CashSessionStatus,
    openedAt: r.opened_at,
    closedAt: r.closed_at,
    openingFloat: r.opening_float,
    expectedCash: r.expected_cash,
    countedCash: r.counted_cash,
    varianceCash: r.variance_cash,
    expectedMtnMomo: r.expected_mtn_momo,
    confirmedMtnMomo: r.confirmed_mtn_momo,
    expectedOrangeMoney: r.expected_orange_money,
    confirmedOrangeMoney: r.confirmed_orange_money,
    creditIssued: r.credit_issued,
    discountTotal: r.discount_total,
    salesCount: r.sales_count,
    voidCount: r.void_count,
    closedReason: r.closed_reason as CashSession['closedReason'],
    recountUsed: r.recount_used === 1,
    closingNote: r.closing_note,
    reviewedBy: r.reviewed_by,
    reviewedAt: r.reviewed_at,
    reviewNote: r.review_note,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}
