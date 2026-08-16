import { randomUUID } from 'crypto'
import {
  CashSessionStatus,
  canTransitionCashSession,
  cashMovementDirection,
  CashMovementKind,
  DEFAULT_CASH_VARIANCE_TOLERANCE,
  DEFAULT_MAX_SHIFT_HOURS,
  DEFAULT_VARIANCE_HISTORY_DAYS,
  isCashSessionLocked,
  type CashDailyReportData,
  type CashDailyReportQuery,
  type CashDailyShiftLine,
  type CashMovement,
  type CashReportKind,
  type CashSession,
  type CashSessionExpectedCash,
  type CashShiftReportData,
  type CashierVarianceStats,
  type CashVarianceHistory,
  type CashVarianceHistoryQuery,
  type CloseCashSessionInput,
  type RecordCashMovementInput,
  type SetCashVarianceReasonInput,
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
  variance_reason: string | null
  variance_note: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string | null
  created_at: string
  updated_at: string
}

const COLS = `id, business_id, outlet_id, device_id, user_id, status, opened_at, closed_at,
  opening_float, expected_cash, counted_cash, variance_cash, expected_mtn_momo, confirmed_mtn_momo,
  expected_orange_money, confirmed_orange_money, credit_issued, discount_total, sales_count,
  void_count, closed_reason, recount_used, closing_note, variance_reason, variance_note,
  reviewed_by, reviewed_at, review_note, created_at, updated_at`

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

  /**
   * Whether the signed-in user's role runs a till (tracks_cash_drawer) — drives the
   * login-time start-shift prompt. Reads the synced local roles table via the member's
   * role_id, so it works offline.
   */
  roleTracksCashDrawer(): boolean {
    const businessId = this.getBusinessId()
    const userId = this.getUserId()
    if (!businessId || !userId) return false
    const row = this.db.get<{ tracks: number }>(
      `SELECT r.tracks_cash_drawer AS tracks
       FROM business_members m JOIN roles r ON r.id = m.role_id
       WHERE m.business_id = ? AND m.user_id = ? AND m.is_deleted = 0`,
      [businessId, userId],
    )
    return row?.tracks === 1
  }

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

  /**
   * The till's live session if it was opened more than `maxHours` ago — an orphan from a
   * crash/dead battery (BIZ-2.5). Returned on launch so the user can resume it or close it.
   */
  findStaleOpenSession(maxHours: number = DEFAULT_MAX_SHIFT_HOURS): CashSession | null {
    const current = this.getCurrent()
    if (!current) return null
    const ageMs = Date.now() - new Date(current.openedAt).getTime()
    return ageMs > maxHours * 3_600_000 ? current : null
  }

  /**
   * Force-close an orphaned shift (BIZ-2.5). Stamps closed_reason=RECOVERED and leaves the
   * count UNKNOWN — counted_cash/variance_cash stay NULL, because a drawer that was never
   * counted at the time has no defensible variance (never fabricate one). Expected cash is
   * snapshotted for information only.
   */
  recoverAndClose(sessionId: string): CashSession {
    const businessId = this.getBusinessId()
    if (!businessId) throw new Error('No active business.')
    const session = this.get(sessionId)
    if (!session) throw new Error('Cash session not found.')
    if (isCashSessionLocked(session.status)) {
      throw new Error('This cash session is already closed.')
    }
    const expected = this.expectedCash(sessionId)?.expectedCash ?? session.openingFloat
    const now = new Date().toISOString()
    this.db.run(
      `UPDATE cash_sessions
       SET status = 'CLOSED', closed_at = ?, closed_reason = 'RECOVERED',
           expected_cash = ?, counted_cash = NULL, variance_cash = NULL, updated_at = ?
       WHERE id = ? AND business_id = ?`,
      [now, expected, now, sessionId, businessId],
    )
    this.push(sessionId, businessId)
    this.onMutated()
    return this.get(sessionId) as CashSession
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
    const movements = this.db.get<{ cin: number; cout: number }>(
      `SELECT
         COALESCE(SUM(CASE WHEN direction = 'IN' THEN amount ELSE 0 END), 0) AS cin,
         COALESCE(SUM(CASE WHEN direction = 'OUT' THEN amount ELSE 0 END), 0) AS cout
       FROM cash_movements
       WHERE cash_session_id = ? AND business_id = ? AND is_deleted = 0`,
      [sessionId, businessId],
    )
    const cashPayments = cash?.v ?? 0
    const changeGiven = change?.v ?? 0
    const cashIn = movements?.cin ?? 0
    const cashOut = movements?.cout ?? 0
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

  /**
   * Per-cashier drawer-accuracy history over the last N days (BIZ-2.6) — the pattern, not
   * the one-off gap. Only NORMAL-closed shifts with a real count (variance not null) count;
   * RECOVERED/ABANDONED shifts are excluded (no trustworthy variance). Cashiers are ranked
   * worst-first by total drawer error (Σ|variance|).
   */
  varianceHistory(query: CashVarianceHistoryQuery = {}): CashVarianceHistory {
    const days = Math.max(1, Math.floor(query.days ?? DEFAULT_VARIANCE_HISTORY_DAYS))
    const tolerance = DEFAULT_CASH_VARIANCE_TOLERANCE
    const to = new Date()
    const fromIso = new Date(to.getTime() - days * 86_400_000).toISOString()
    const businessId = this.getBusinessId()
    const empty: CashVarianceHistory = {
      fromDate: fromIso,
      toDate: to.toISOString(),
      toleranceXaf: tolerance,
      cashiers: [],
    }
    if (!businessId) return empty

    const groups = this.db.query<{
      user_id: string
      cashier_name: string | null
      shifts: number
      mean_variance: number
      net_variance: number
      abs_variance: number
      outside_count: number
    }>(
      `SELECT cs.user_id,
              (SELECT bm.name FROM business_members bm
                 WHERE bm.business_id = cs.business_id AND bm.user_id = cs.user_id
                   AND bm.is_deleted = 0 LIMIT 1) AS cashier_name,
              COUNT(*) AS shifts,
              AVG(cs.variance_cash) AS mean_variance,
              SUM(cs.variance_cash) AS net_variance,
              SUM(ABS(cs.variance_cash)) AS abs_variance,
              SUM(CASE WHEN ABS(cs.variance_cash) > ? THEN 1 ELSE 0 END) AS outside_count
       FROM cash_sessions cs
       WHERE cs.business_id = ? AND cs.is_deleted = 0
         AND cs.status = 'CLOSED' AND cs.variance_cash IS NOT NULL
         AND cs.closed_at IS NOT NULL AND cs.closed_at >= ?
       GROUP BY cs.user_id
       ORDER BY abs_variance DESC`,
      [tolerance, businessId, fromIso],
    )

    const cashiers: CashierVarianceStats[] = groups.map((g) => {
      const worst = this.db.get<{ id: string; variance_cash: number; closed_at: string }>(
        `SELECT id, variance_cash, closed_at FROM cash_sessions
         WHERE business_id = ? AND user_id = ? AND is_deleted = 0
           AND status = 'CLOSED' AND variance_cash IS NOT NULL
           AND closed_at IS NOT NULL AND closed_at >= ?
         ORDER BY ABS(variance_cash) DESC, closed_at DESC LIMIT 1`,
        [businessId, g.user_id, fromIso],
      )
      return {
        userId: g.user_id,
        cashierName: g.cashier_name,
        shifts: g.shifts,
        meanVarianceCash: Math.round(g.mean_variance ?? 0),
        netVarianceCash: Math.round(g.net_variance ?? 0),
        sumAbsVarianceCash: Math.round(g.abs_variance ?? 0),
        outsideToleranceCount: g.outside_count,
        pctOutsideTolerance: g.shifts > 0 ? Math.round((g.outside_count / g.shifts) * 100) : 0,
        worstShift: worst
          ? { sessionId: worst.id, varianceCash: worst.variance_cash, closedAt: worst.closed_at }
          : null,
      }
    })

    return { ...empty, cashiers }
  }

  /**
   * Cashier display name for a session's user (denormalised member name, offline-safe).
   */
  private cashierName(businessId: string, userId: string): string | null {
    const row = this.db.get<{ name: string | null }>(
      `SELECT name FROM business_members
       WHERE business_id = ? AND user_id = ? AND is_deleted = 0 LIMIT 1`,
      [businessId, userId],
    )
    return row?.name ?? null
  }

  /**
   * Sales / tender / movement facts for a single shift, recomputed from the source rows
   * (the denormalised session counters aren't maintained). Shared by the Z/X report and the
   * daily close so both agree by construction. All whole XAF.
   */
  private shiftFacts(
    businessId: string,
    sessionId: string,
  ): {
    salesCount: number
    voidCount: number
    grossSales: number
    discountTotal: number
    netSales: number
    creditIssued: number
    changeGiven: number
    cash: number
    mtnMomo: number
    orangeMoney: number
    card: number
    movementsIn: number
    movementsOut: number
  } {
    const s = this.db.get<{
      n: number
      voids: number
      gross: number
      disc: number
      net: number
      credit: number
      change_given: number
    }>(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END), 0) AS n,
         COALESCE(SUM(CASE WHEN status = 'VOIDED' THEN 1 ELSE 0 END), 0) AS voids,
         COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN subtotal ELSE 0 END), 0) AS gross,
         COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN discount_amount ELSE 0 END), 0) AS disc,
         COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN total_amount ELSE 0 END), 0) AS net,
         COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN credit_amount ELSE 0 END), 0) AS credit,
         COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN change_given ELSE 0 END), 0) AS change_given
       FROM sales
       WHERE cash_session_id = ? AND business_id = ? AND is_deleted = 0`,
      [sessionId, businessId],
    )
    const t = this.db.get<{ cash: number; mtn: number; orange: number; card: number }>(
      `SELECT
         COALESCE(SUM(CASE WHEN sp.method = 'CASH' THEN sp.amount ELSE 0 END), 0) AS cash,
         COALESCE(SUM(CASE WHEN sp.method = 'MTN_MOMO' THEN sp.amount ELSE 0 END), 0) AS mtn,
         COALESCE(SUM(CASE WHEN sp.method = 'ORANGE_MONEY' THEN sp.amount ELSE 0 END), 0) AS orange,
         COALESCE(SUM(CASE WHEN sp.method = 'CARD' THEN sp.amount ELSE 0 END), 0) AS card
       FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id
       WHERE s.cash_session_id = ? AND s.business_id = ? AND s.status = 'COMPLETED' AND s.is_deleted = 0`,
      [sessionId, businessId],
    )
    const m = this.db.get<{ cin: number; cout: number }>(
      `SELECT
         COALESCE(SUM(CASE WHEN direction = 'IN' THEN amount ELSE 0 END), 0) AS cin,
         COALESCE(SUM(CASE WHEN direction = 'OUT' THEN amount ELSE 0 END), 0) AS cout
       FROM cash_movements
       WHERE cash_session_id = ? AND business_id = ? AND is_deleted = 0`,
      [sessionId, businessId],
    )
    return {
      salesCount: s?.n ?? 0,
      voidCount: s?.voids ?? 0,
      grossSales: s?.gross ?? 0,
      discountTotal: s?.disc ?? 0,
      netSales: s?.net ?? 0,
      creditIssued: s?.credit ?? 0,
      changeGiven: s?.change_given ?? 0,
      cash: t?.cash ?? 0,
      mtnMomo: t?.mtn ?? 0,
      orangeMoney: t?.orange ?? 0,
      card: t?.card ?? 0,
      movementsIn: m?.cin ?? 0,
      movementsOut: m?.cout ?? 0,
    }
  }

  /**
   * Z-report (per shift, at close) or X-report (mid-shift read of an open session) — BIZ-2.6.
   * A neutral money payload the renderer turns into a branded document to print / share on
   * WhatsApp. For a CLOSED shift the drawer figures are the immutable close snapshot; for an
   * open one, expected cash is live and the count/variance are null (the count is blind, only
   * taken at close). Recomputes tenders/movements from source so it agrees with the drawer.
   */
  shiftReport(sessionId: string, kind: CashReportKind = 'Z'): CashShiftReportData | null {
    const businessId = this.getBusinessId()
    if (!businessId) return null
    const session = this.get(sessionId)
    if (!session) return null

    const f = this.shiftFacts(businessId, sessionId)
    const liveExpected = computeExpectedCash({
      openingFloat: session.openingFloat,
      cashPayments: f.cash,
      changeGiven: f.changeGiven,
      cashIn: f.movementsIn,
      cashOut: f.movementsOut,
    })
    const closed = isCashSessionLocked(session.status)
    const expectedCash = closed ? (session.expectedCash ?? liveExpected) : liveExpected

    const moves = this.db.query<{
      kind: string
      direction: string
      amount: number
      note: string | null
      created_at: string
    }>(
      `SELECT kind, direction, amount, note, created_at
       FROM cash_movements
       WHERE cash_session_id = ? AND business_id = ? AND is_deleted = 0
       ORDER BY created_at ASC`,
      [sessionId, businessId],
    )

    return {
      kind,
      currency: 'XAF',
      sessionId: session.id,
      status: session.status,
      cashierName: this.cashierName(businessId, session.userId),
      deviceId: session.deviceId,
      openedAt: session.openedAt,
      closedAt: session.closedAt ?? null,
      closedReason: session.closedReason ?? null,
      generatedAt: new Date().toISOString(),
      sales: {
        count: f.salesCount,
        voidCount: f.voidCount,
        grossSales: f.grossSales,
        discountTotal: f.discountTotal,
        netSales: f.netSales,
        creditIssued: f.creditIssued,
      },
      tenders: { cash: f.cash, mtnMomo: f.mtnMomo, orangeMoney: f.orangeMoney, card: f.card },
      drawer: {
        openingFloat: session.openingFloat,
        cashSales: f.cash,
        changeGiven: f.changeGiven,
        movementsIn: f.movementsIn,
        movementsOut: f.movementsOut,
        expectedCash,
        countedCash: closed ? (session.countedCash ?? null) : null,
        varianceCash: closed ? (session.varianceCash ?? null) : null,
      },
      momo: {
        expectedMtn: closed ? (session.expectedMtnMomo ?? f.mtnMomo) : f.mtnMomo,
        confirmedMtn: session.confirmedMtnMomo ?? null,
        expectedOrange: closed ? (session.expectedOrangeMoney ?? f.orangeMoney) : f.orangeMoney,
        confirmedOrange: session.confirmedOrangeMoney ?? null,
      },
      movements: moves.map((r) => ({
        kind: r.kind,
        direction: r.direction as 'IN' | 'OUT',
        amount: r.amount,
        note: r.note,
        createdAt: r.created_at,
      })),
      varianceReason: session.varianceReason ?? null,
      varianceNote: session.varianceNote ?? null,
      closingNote: session.closingNote ?? null,
    }
  }

  /**
   * Daily close (BIZ-2.6) — every shift for the business that opened within the given day,
   * plus rolled-up totals. A read-only review (no new stored aggregate); the server endpoint
   * reconciles these totals against `daily_sale_summaries`. Defaults to the current UTC day.
   */
  dailyReport(query: CashDailyReportQuery = {}): CashDailyReportData {
    const businessId = this.getBusinessId()
    const now = new Date()
    const startOfDay = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    ).toISOString()
    const fromIso = query.fromIso ?? startOfDay
    const toIso = query.toIso ?? new Date(new Date(fromIso).getTime() + 86_400_000).toISOString()
    const generatedAt = now.toISOString()
    const empty: CashDailyReportData = {
      currency: 'XAF',
      fromDate: fromIso,
      toDate: toIso,
      generatedAt,
      shifts: [],
      totals: {
        shifts: 0,
        salesCount: 0,
        voidCount: 0,
        grossSales: 0,
        discountTotal: 0,
        netSales: 0,
        creditIssued: 0,
        cash: 0,
        mtnMomo: 0,
        orangeMoney: 0,
        card: 0,
        openingFloat: 0,
        expectedCash: 0,
        countedCash: 0,
        varianceCash: 0,
      },
      reconciliation: null,
    }
    if (!businessId) return empty

    const rows = this.db.query<SessionRow>(
      `SELECT ${COLS} FROM cash_sessions
       WHERE business_id = ? AND is_deleted = 0
         AND opened_at >= ? AND opened_at < ?
       ORDER BY opened_at DESC`,
      [businessId, fromIso, toIso],
    )

    const shifts: CashDailyShiftLine[] = []
    const totals = empty.totals
    for (const row of rows) {
      const session = toCashSession(row)
      const f = this.shiftFacts(businessId, session.id)
      const closed = isCashSessionLocked(session.status)
      const liveExpected = computeExpectedCash({
        openingFloat: session.openingFloat,
        cashPayments: f.cash,
        changeGiven: f.changeGiven,
        cashIn: f.movementsIn,
        cashOut: f.movementsOut,
      })
      const expectedCash = closed ? (session.expectedCash ?? liveExpected) : liveExpected
      shifts.push({
        sessionId: session.id,
        cashierName: this.cashierName(businessId, session.userId),
        status: session.status,
        openedAt: session.openedAt,
        closedAt: session.closedAt ?? null,
        openingFloat: session.openingFloat,
        expectedCash,
        countedCash: closed ? (session.countedCash ?? null) : null,
        varianceCash: closed ? (session.varianceCash ?? null) : null,
        cashSales: f.cash,
        salesCount: f.salesCount,
      })
      totals.shifts += 1
      totals.salesCount += f.salesCount
      totals.voidCount += f.voidCount
      totals.grossSales += f.grossSales
      totals.discountTotal += f.discountTotal
      totals.netSales += f.netSales
      totals.creditIssued += f.creditIssued
      totals.cash += f.cash
      totals.mtnMomo += f.mtnMomo
      totals.orangeMoney += f.orangeMoney
      totals.card += f.card
      totals.openingFloat += session.openingFloat
      totals.expectedCash += expectedCash
      if (closed) {
        totals.countedCash += session.countedCash ?? 0
        totals.varianceCash += session.varianceCash ?? 0
      }
    }

    return { ...empty, shifts, totals }
  }

  /**
   * Close a shift (BIZ-2.4). The cashier submits a blind denomination count for cash and,
   * optionally, the confirmed MoMo/Orange balances read off the phone. Persists the count
   * lines, snapshots expected cash, computes the variance (counted − expected), and moves
   * the session to CLOSED. A closed session is immutable to every role thereafter.
   */
  closeSession(sessionId: string, input: CloseCashSessionInput): CashSession {
    const businessId = this.getBusinessId()
    if (!businessId) throw new Error('No active business.')
    const session = this.get(sessionId)
    if (!session) throw new Error('Cash session not found.')
    if (isCashSessionLocked(session.status)) {
      throw new Error('This cash session is already closed.')
    }

    const expectedCashTotal = this.expectedCash(sessionId)?.expectedCash ?? session.openingFloat
    const counted = input.counts.reduce(
      (sum, c) => sum + Math.round(c.denomination) * Math.max(0, Math.round(c.quantity)),
      0,
    )
    const variance = counted - expectedCashTotal

    // Expected MoMo/Orange for the shift (reconciled per tender, never blended with cash).
    const tender = this.db.get<{ momo: number; orange: number }>(
      `SELECT
         COALESCE(SUM(CASE WHEN sp.method = 'MTN_MOMO' THEN sp.amount ELSE 0 END), 0) AS momo,
         COALESCE(SUM(CASE WHEN sp.method = 'ORANGE_MONEY' THEN sp.amount ELSE 0 END), 0) AS orange
       FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id
       WHERE s.cash_session_id = ? AND s.business_id = ? AND s.status = 'COMPLETED' AND s.is_deleted = 0`,
      [sessionId, businessId],
    )

    const now = new Date().toISOString()
    for (const c of input.counts) {
      const qty = Math.max(0, Math.round(c.quantity))
      if (qty <= 0) continue
      const lineId = randomUUID()
      this.db.run(
        `INSERT INTO cash_count_lines
          (id, cash_session_id, denomination, quantity, is_deleted, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, ?, ?)`,
        [lineId, sessionId, Math.round(c.denomination), qty, now, now],
      )
      this.pushCountLine(lineId)
    }

    this.db.run(
      `UPDATE cash_sessions SET
         status = 'CLOSED', closed_at = ?, closed_reason = 'NORMAL',
         expected_cash = ?, counted_cash = ?, variance_cash = ?,
         expected_mtn_momo = ?, confirmed_mtn_momo = ?,
         expected_orange_money = ?, confirmed_orange_money = ?,
         closing_note = COALESCE(?, closing_note), recount_used = ?, updated_at = ?
       WHERE id = ? AND business_id = ?`,
      [
        now,
        expectedCashTotal,
        counted,
        variance,
        tender?.momo ?? 0,
        input.confirmedMtnMomo ?? null,
        tender?.orange ?? 0,
        input.confirmedOrangeMoney ?? null,
        input.closingNote ?? null,
        input.recountUsed ? 1 : 0,
        now,
        sessionId,
        businessId,
      ],
    )
    this.push(sessionId, businessId)
    this.onMutated()
    return this.get(sessionId) as CashSession
  }

  /**
   * Record why a just-closed shift's count missed (BIZ-2.6) — set after the blind close
   * reveals an out-of-tolerance variance. Allowed on a CLOSED session (it's review
   * metadata, like the owner reconciliation note; the count itself stays immutable).
   */
  setVarianceReason(sessionId: string, input: SetCashVarianceReasonInput): CashSession {
    const businessId = this.getBusinessId()
    if (!businessId) throw new Error('No active business.')
    const session = this.get(sessionId)
    if (!session) throw new Error('Cash session not found.')
    if (session.status !== CashSessionStatus.CLOSED) {
      throw new Error('A variance reason can only be set on a just-closed shift.')
    }
    const now = new Date().toISOString()
    this.db.run(
      `UPDATE cash_sessions SET variance_reason = ?, variance_note = ?, updated_at = ?
       WHERE id = ? AND business_id = ?`,
      [input.reason, input.note?.trim() || null, now, sessionId, businessId],
    )
    this.push(sessionId, businessId)
    this.onMutated()
    return this.get(sessionId) as CashSession
  }

  private pushCountLine(id: string): void {
    const row = this.db.get<{
      id: string
      cash_session_id: string
      denomination: number
      quantity: number
      created_at: string
      updated_at: string
    }>(
      `SELECT id, cash_session_id, denomination, quantity, created_at, updated_at
       FROM cash_count_lines WHERE id = ?`,
      [id],
    )
    if (!row) return
    const rec = {
      id: row.id,
      cashSessionId: row.cash_session_id,
      denomination: row.denomination,
      quantity: row.quantity,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
    const now = new Date().toISOString()
    this.db.run(
      `INSERT INTO sync_outbox (id, entity, record_id, operation, payload, status, attempt_count, created_at, updated_at)
       VALUES (?, 'cashCountLines', ?, 'UPSERT', ?, 'pending', 0, ?, ?)
       ON CONFLICT(entity, record_id) DO UPDATE SET
         operation = excluded.operation, payload = excluded.payload, status = 'pending',
         attempt_count = 0, next_attempt_at = NULL, last_error = NULL, updated_at = excluded.updated_at`,
      [randomUUID(), id, JSON.stringify(rec), now, now],
    )
  }

  /**
   * Record a cash movement against the open shift (BIZ-2.3) — owner draw, drop, change
   * in/out, credit repayment, expense, supplier payment. Requires an open session (the
   * drawer belongs to a shift). The EXPENSE→Expense P&L bridge is wired in slice 2.
   */
  recordMovement(input: RecordCashMovementInput): CashMovement {
    const businessId = this.getBusinessId()
    if (!businessId) throw new Error('No active business.')
    const session = this.getCurrent()
    if (!session) throw new Error('Open a cash session before recording a cash movement.')

    const amount = Math.round(input.amount)
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Amount must be greater than 0.')

    const id = input.id ?? randomUUID()
    const direction = cashMovementDirection(input.kind)
    const now = new Date().toISOString()
    this.db.run(
      `INSERT INTO cash_movements
        (id, business_id, cash_session_id, user_id, kind, direction, amount, note,
         reference_type, reference_id, is_deleted, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        id,
        businessId,
        session.id,
        this.getUserId(),
        input.kind,
        direction,
        amount,
        input.note ?? null,
        input.referenceType ?? null,
        input.referenceId ?? null,
        now,
        now,
      ],
    )
    this.pushMovement(id)
    this.onMutated()
    return this.getMovement(id) as CashMovement
  }

  /**
   * Record a cash_movement for the CURRENT open shift from another flow (a debt/expense/
   * deposit paid in cash), so the drawer reconciles against ALL cash — not just sales.
   * No-op (returns null) when no shift is open or the amount is not positive.
   */
  recordAutoMovement(input: {
    kind: CashMovementKind
    amount: number
    note?: string | null
    referenceType?: string | null
    referenceId?: string | null
  }): CashMovement | null {
    const businessId = this.getBusinessId()
    if (!businessId) return null
    const session = this.getCurrent()
    if (!session) return null
    const amount = Math.round(input.amount)
    if (!Number.isFinite(amount) || amount <= 0) return null

    const id = randomUUID()
    const direction = cashMovementDirection(input.kind)
    const now = new Date().toISOString()
    this.db.run(
      `INSERT INTO cash_movements
        (id, business_id, cash_session_id, user_id, kind, direction, amount, note,
         reference_type, reference_id, is_deleted, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        id,
        businessId,
        session.id,
        this.getUserId(),
        input.kind,
        direction,
        amount,
        input.note ?? null,
        input.referenceType ?? null,
        input.referenceId ?? null,
        now,
        now,
      ],
    )
    this.pushMovement(id)
    this.onMutated()
    return this.getMovement(id)
  }

  /** Cash movements for a session, newest first. */
  listMovements(sessionId: string): CashMovement[] {
    const businessId = this.getBusinessId()
    if (!businessId) return []
    return this.db
      .query<MovementRow>(
        `SELECT ${MOVE_COLS} FROM cash_movements
         WHERE cash_session_id = ? AND business_id = ? AND is_deleted = 0
         ORDER BY created_at DESC`,
        [sessionId, businessId],
      )
      .map(toCashMovement)
  }

  private getMovement(id: string): CashMovement | null {
    const businessId = this.getBusinessId()
    if (!businessId) return null
    const row = this.db.get<MovementRow>(
      `SELECT ${MOVE_COLS} FROM cash_movements WHERE id = ? AND business_id = ?`,
      [id, businessId],
    )
    return row ? toCashMovement(row) : null
  }

  private pushMovement(id: string): void {
    const rec = this.getMovement(id)
    if (!rec) return
    const now = new Date().toISOString()
    this.db.run(
      `INSERT INTO sync_outbox (id, entity, record_id, operation, payload, status, attempt_count, created_at, updated_at)
       VALUES (?, 'cashMovements', ?, 'UPSERT', ?, 'pending', 0, ?, ?)
       ON CONFLICT(entity, record_id) DO UPDATE SET
         operation = excluded.operation, payload = excluded.payload, status = 'pending',
         attempt_count = 0, next_attempt_at = NULL, last_error = NULL, updated_at = excluded.updated_at`,
      [randomUUID(), id, JSON.stringify(rec), now, now],
    )
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

interface MovementRow {
  id: string
  business_id: string
  cash_session_id: string
  user_id: string
  kind: string
  direction: string
  amount: number
  note: string | null
  reference_type: string | null
  reference_id: string | null
  created_at: string
  updated_at: string
}

const MOVE_COLS = `id, business_id, cash_session_id, user_id, kind, direction, amount, note,
  reference_type, reference_id, created_at, updated_at`

function toCashMovement(r: MovementRow): CashMovement {
  return {
    id: r.id,
    businessId: r.business_id,
    cashSessionId: r.cash_session_id,
    userId: r.user_id,
    kind: r.kind as CashMovement['kind'],
    direction: r.direction as CashMovement['direction'],
    amount: r.amount,
    note: r.note,
    referenceType: r.reference_type,
    referenceId: r.reference_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
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
    varianceReason: r.variance_reason as CashSession['varianceReason'],
    varianceNote: r.variance_note,
    reviewedBy: r.reviewed_by,
    reviewedAt: r.reviewed_at,
    reviewNote: r.review_note,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}
