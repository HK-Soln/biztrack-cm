import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  ABANDONED_SHIFT_HOURS,
  CashSessionClosedReason,
  CashSessionStatus,
  DEFAULT_CASH_VARIANCE_TOLERANCE,
  DEFAULT_VARIANCE_HISTORY_DAYS,
  canTransitionCashSession,
  cashMovementDirection,
  isCashSessionLocked,
  type CashCountLineSyncRecord,
  type CashierVarianceStats,
  type CashDailyReconciliation,
  type CashDailyReportData,
  type CashDailyReportQuery,
  type CashDailyShiftLine,
  type CashDailyTotals,
  type CashMovement as CashMovementDto,
  type CashMovementSyncRecord,
  type CashReportKind,
  type CashSessionExpectedCash,
  type CashSessionSyncRecord,
  type CashShiftReportData,
  type CashVarianceHistory,
  type CashVarianceHistoryQuery,
  type CloseCashSessionInput,
  type JwtPayload,
  type PaginatedResult,
  type RecordCashMovementInput,
  type SetCashVarianceReasonInput,
} from '@biztrack/types'
import { computeExpectedCash } from '@biztrack/utils'
import { AppBadRequestException, AppNotFoundException } from '@/common/exceptions/app-exceptions'
import { CashSession } from '@/entities/cash-session.entity'
import { CashCountLine } from '@/entities/cash-count-line.entity'
import { CashMovement } from '@/entities/cash-movement.entity'
import {
  OpenCashSessionDto,
  ListCashSessionsQueryDto,
  TransitionCashSessionDto,
} from '../dto/cash-session.dto'

/** Normalise a timestamp column (Date or string) to an ISO-8601 string for report payloads. */
function toIso(v: Date | string): string {
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString()
}

/**
 * Cash sessions (BIZ-2.1). Owns the shift lifecycle and the sync apply/pull path.
 *
 * The state machine (OPEN → COUNTING → CLOSED → RECONCILED, + ABANDONED) is enforced
 * on every transition via the shared `canTransitionCashSession`; once CLOSED the row is
 * locked to every role (`isCashSessionLocked`) — corrections go through a separate
 * adjustment record, never by editing the close. Expected-cash / blind-count logic lands
 * in BIZ-2.2 / BIZ-2.4; this service is the foundation they build on.
 */
@Injectable()
export class CashSessionsService {
  constructor(
    @InjectRepository(CashSession)
    private readonly sessionsRepo: Repository<CashSession>,
    @InjectRepository(CashCountLine)
    private readonly countLinesRepo: Repository<CashCountLine>,
    @InjectRepository(CashMovement)
    private readonly movementsRepo: Repository<CashMovement>,
  ) {}

  async openSession(
    businessId: string,
    user: JwtPayload,
    dto: OpenCashSessionDto,
  ): Promise<CashSession> {
    const deviceId = dto.deviceId ?? user.deviceId ?? 'unknown'
    // One live session per till at a time.
    const existing = await this.sessionsRepo.findOne({
      where: [
        { businessId, deviceId, status: CashSessionStatus.OPEN },
        { businessId, deviceId, status: CashSessionStatus.COUNTING },
      ],
    })
    if (existing) {
      throw new AppBadRequestException(
        'A cash session is already open on this device.',
        'CASH_SESSION_ALREADY_OPEN',
      )
    }

    const now = new Date()
    return this.sessionsRepo.save(
      this.sessionsRepo.create({
        id: dto.id,
        businessId,
        deviceId,
        userId: user.sub,
        status: CashSessionStatus.OPEN,
        openedAt: now,
        openingFloat: dto.openingFloat ?? 0,
        creditIssued: 0,
        discountTotal: 0,
        salesCount: 0,
        voidCount: 0,
        recountUsed: false,
      }),
    )
  }

  async transition(
    businessId: string,
    id: string,
    dto: TransitionCashSessionDto,
  ): Promise<CashSession> {
    const session = await this.findById(id, businessId)
    if (isCashSessionLocked(session.status)) {
      throw new AppBadRequestException(
        'This cash session is closed and can no longer be edited.',
        'CASH_SESSION_LOCKED',
      )
    }
    if (!canTransitionCashSession(session.status, dto.status)) {
      throw new AppBadRequestException(
        `Cannot move a cash session from ${session.status} to ${dto.status}.`,
        'CASH_SESSION_INVALID_TRANSITION',
      )
    }

    session.status = dto.status
    if (dto.closingNote !== undefined) session.closingNote = dto.closingNote
    if (dto.status === CashSessionStatus.CLOSED) session.closedAt = new Date()
    return this.sessionsRepo.save(session)
  }

  async closeSession(
    businessId: string,
    sessionId: string,
    input: CloseCashSessionInput,
  ): Promise<CashSession> {
    const session = await this.findById(sessionId, businessId)
    if (isCashSessionLocked(session.status)) {
      throw new AppBadRequestException(
        'This cash session is already closed.',
        'CASH_SESSION_LOCKED',
      )
    }

    const expected = (await this.expectedCash(businessId, sessionId)).expectedCash
    const counted = input.counts.reduce(
      (sum, c) => sum + Math.round(c.denomination) * Math.max(0, Math.round(c.quantity)),
      0,
    )

    const tender = await this.sessionsRepo.manager
      .createQueryBuilder()
      .select(
        `COALESCE(SUM(CASE WHEN sp.method = 'MTN_MOMO' THEN sp.amount ELSE 0 END), 0)`,
        'momo',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN sp.method = 'ORANGE_MONEY' THEN sp.amount ELSE 0 END), 0)`,
        'orange',
      )
      .from('sale_payments', 'sp')
      .innerJoin('sales', 's', 's.id = sp.sale_id')
      .where('s.cash_session_id = :sessionId', { sessionId })
      .andWhere('s.business_id = :businessId', { businessId })
      .andWhere("s.status = 'COMPLETED'")
      .andWhere('s.deleted_at IS NULL')
      .getRawOne<{ momo: string; orange: string }>()

    for (const c of input.counts) {
      const qty = Math.max(0, Math.round(c.quantity))
      if (qty <= 0) continue
      await this.countLinesRepo.save(
        this.countLinesRepo.create({
          cashSessionId: sessionId,
          denomination: Math.round(c.denomination),
          quantity: qty,
        }),
      )
    }

    session.status = CashSessionStatus.CLOSED
    session.closedAt = new Date()
    session.closedReason = CashSessionClosedReason.NORMAL
    session.expectedCash = expected
    session.countedCash = counted
    session.varianceCash = counted - expected
    session.expectedMtnMomo = Number(tender?.momo ?? 0)
    session.confirmedMtnMomo = input.confirmedMtnMomo ?? null
    session.expectedOrangeMoney = Number(tender?.orange ?? 0)
    session.confirmedOrangeMoney = input.confirmedOrangeMoney ?? null
    if (input.closingNote !== undefined) session.closingNote = input.closingNote
    session.recountUsed = input.recountUsed ?? false
    return this.sessionsRepo.save(session)
  }

  /**
   * Mark shifts left OPEN/COUNTING and untouched for more than ABANDONED_SHIFT_HOURS (72h)
   * as ABANDONED (BIZ-2.5), across all businesses. Run on a schedule. These are excluded
   * from variance statistics (they never closed, so there's no count) but stay visible —
   * a cashier who never closes is itself a finding. Bumping updated_at syncs the status
   * down to devices. Returns how many were swept.
   */
  async markAbandonedSessions(): Promise<number> {
    const cutoff = new Date(Date.now() - ABANDONED_SHIFT_HOURS * 3_600_000)
    const result = await this.sessionsRepo
      .createQueryBuilder()
      .update(CashSession)
      .set({ status: CashSessionStatus.ABANDONED })
      .where('status IN (:...statuses)', {
        statuses: [CashSessionStatus.OPEN, CashSessionStatus.COUNTING],
      })
      .andWhere('updated_at < :cutoff', { cutoff })
      .execute()
    return result.affected ?? 0
  }

  async setVarianceReason(
    businessId: string,
    sessionId: string,
    input: SetCashVarianceReasonInput,
  ): Promise<CashSession> {
    const session = await this.findById(sessionId, businessId)
    if (session.status !== CashSessionStatus.CLOSED) {
      throw new AppBadRequestException(
        'A variance reason can only be set on a just-closed shift.',
        'CASH_SESSION_NOT_CLOSED',
      )
    }
    session.varianceReason = input.reason
    session.varianceNote = input.note?.trim() || null
    return this.sessionsRepo.save(session)
  }

  async findById(id: string, businessId: string): Promise<CashSession> {
    const session = await this.sessionsRepo.findOne({ where: { id, businessId } })
    if (!session) {
      throw new AppNotFoundException('Cash session not found.', 'CASH_SESSION_NOT_FOUND')
    }
    return session
  }

  async getCurrent(businessId: string, deviceId: string): Promise<CashSession | null> {
    return this.sessionsRepo.findOne({
      where: [
        { businessId, deviceId, status: CashSessionStatus.OPEN },
        { businessId, deviceId, status: CashSessionStatus.COUNTING },
      ],
      order: { openedAt: 'DESC' },
    })
  }

  async list(
    businessId: string,
    query: ListCashSessionsQueryDto,
  ): Promise<PaginatedResult<CashSession>> {
    const page = Math.max(1, query.page ?? 1)
    const limit = Math.max(1, query.limit ?? 20)
    const qb = this.sessionsRepo
      .createQueryBuilder('cs')
      .where('cs.business_id = :businessId', { businessId })
    if (query.status) qb.andWhere('cs.status = :status', { status: query.status })
    qb.orderBy('cs.opened_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)

    const [data, total] = await qb.getManyAndCount()
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) }
  }

  /**
   * Expected-cash breakdown for a session (BIZ-2.2). Uses the shared
   * `computeExpectedCash` so it matches the desktop by construction. Cash movements
   * (cashIn/cashOut) are 0 until BIZ-2.3.
   */
  async expectedCash(businessId: string, sessionId: string): Promise<CashSessionExpectedCash> {
    const session = await this.findById(sessionId, businessId)

    const cashRow = await this.sessionsRepo.manager
      .createQueryBuilder()
      .select('COALESCE(SUM(sp.amount), 0)', 'v')
      .from('sale_payments', 'sp')
      .innerJoin('sales', 's', 's.id = sp.sale_id')
      .where('s.cash_session_id = :sessionId', { sessionId })
      .andWhere('s.business_id = :businessId', { businessId })
      .andWhere("sp.method = 'CASH'")
      .andWhere("s.status = 'COMPLETED'")
      .andWhere('s.deleted_at IS NULL')
      .getRawOne<{ v: string }>()

    const changeRow = await this.sessionsRepo.manager
      .createQueryBuilder()
      .select('COALESCE(SUM(s.change_given), 0)', 'v')
      .from('sales', 's')
      .where('s.cash_session_id = :sessionId', { sessionId })
      .andWhere('s.business_id = :businessId', { businessId })
      .andWhere("s.status = 'COMPLETED'")
      .andWhere('s.deleted_at IS NULL')
      .getRawOne<{ v: string }>()

    const moveRow = await this.movementsRepo
      .createQueryBuilder('m')
      .select(`COALESCE(SUM(CASE WHEN m.direction = 'IN' THEN m.amount ELSE 0 END), 0)`, 'cin')
      .addSelect(`COALESCE(SUM(CASE WHEN m.direction = 'OUT' THEN m.amount ELSE 0 END), 0)`, 'cout')
      .where('m.cash_session_id = :sessionId', { sessionId })
      .andWhere('m.business_id = :businessId', { businessId })
      .andWhere('m.deleted_at IS NULL')
      .getRawOne<{ cin: string; cout: string }>()

    const cashPayments = Number(cashRow?.v ?? 0)
    const changeGiven = Number(changeRow?.v ?? 0)
    const cashIn = Number(moveRow?.cin ?? 0)
    const cashOut = Number(moveRow?.cout ?? 0)
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
   * Per-cashier drawer-accuracy history over the last N days (BIZ-2.6) — mirrors the desktop
   * `varianceHistory` (same filters, same ranking) so cloud and device agree. Only NORMAL-closed
   * shifts with a real count (variance not null) count; RECOVERED/ABANDONED are excluded.
   */
  async varianceHistory(
    businessId: string,
    query: CashVarianceHistoryQuery = {},
  ): Promise<CashVarianceHistory> {
    const days = Math.max(1, Math.floor(query.days ?? DEFAULT_VARIANCE_HISTORY_DAYS))
    const tolerance = DEFAULT_CASH_VARIANCE_TOLERANCE
    const to = new Date()
    const from = new Date(to.getTime() - days * 86_400_000)
    const fromIso = from.toISOString()

    const groups = (await this.sessionsRepo.manager.query(
      `SELECT cs.user_id AS user_id, u.name AS cashier_name,
              COUNT(*)::int AS shifts,
              AVG(cs.variance_cash) AS mean_variance,
              SUM(cs.variance_cash) AS net_variance,
              SUM(ABS(cs.variance_cash)) AS abs_variance,
              SUM(CASE WHEN ABS(cs.variance_cash) > $1 THEN 1 ELSE 0 END)::int AS outside_count
       FROM cash_sessions cs
       LEFT JOIN users u ON u.id = cs.user_id
       WHERE cs.business_id = $2 AND cs.deleted_at IS NULL
         AND cs.status = 'CLOSED' AND cs.variance_cash IS NOT NULL
         AND cs.closed_at IS NOT NULL AND cs.closed_at >= $3
       GROUP BY cs.user_id, u.name
       ORDER BY abs_variance DESC`,
      [tolerance, businessId, fromIso],
    )) as Array<{
      user_id: string
      cashier_name: string | null
      shifts: number
      mean_variance: string | null
      net_variance: string | null
      abs_variance: string | null
      outside_count: number
    }>

    const worst = (await this.sessionsRepo.manager.query(
      `SELECT DISTINCT ON (cs.user_id) cs.user_id AS user_id, cs.id AS id,
              cs.variance_cash AS variance_cash, cs.closed_at AS closed_at
       FROM cash_sessions cs
       WHERE cs.business_id = $1 AND cs.deleted_at IS NULL
         AND cs.status = 'CLOSED' AND cs.variance_cash IS NOT NULL
         AND cs.closed_at IS NOT NULL AND cs.closed_at >= $2
       ORDER BY cs.user_id, ABS(cs.variance_cash) DESC, cs.closed_at DESC`,
      [businessId, fromIso],
    )) as Array<{ user_id: string; id: string; variance_cash: number; closed_at: Date | string }>
    const worstByUser = new Map(worst.map((w) => [w.user_id, w]))

    const cashiers: CashierVarianceStats[] = groups.map((g) => {
      const w = worstByUser.get(g.user_id)
      const shifts = Number(g.shifts)
      const outside = Number(g.outside_count)
      return {
        userId: g.user_id,
        cashierName: g.cashier_name,
        shifts,
        meanVarianceCash: Math.round(Number(g.mean_variance ?? 0)),
        netVarianceCash: Math.round(Number(g.net_variance ?? 0)),
        sumAbsVarianceCash: Math.round(Number(g.abs_variance ?? 0)),
        outsideToleranceCount: outside,
        pctOutsideTolerance: shifts > 0 ? Math.round((outside / shifts) * 100) : 0,
        worstShift: w
          ? {
              sessionId: w.id,
              varianceCash: Number(w.variance_cash),
              closedAt: w.closed_at instanceof Date ? w.closed_at.toISOString() : w.closed_at,
            }
          : null,
      }
    })

    return { fromDate: fromIso, toDate: to.toISOString(), toleranceXaf: tolerance, cashiers }
  }

  // --- Z / X reports + daily close (BIZ-2.6) --------------------------------

  private async cashierName(userId: string): Promise<string | null> {
    const row = (await this.sessionsRepo.manager.query(
      `SELECT name FROM users WHERE id = $1 LIMIT 1`,
      [userId],
    )) as Array<{ name: string | null }>
    return row[0]?.name ?? null
  }

  /**
   * Sales / tender / movement facts for one shift, recomputed from source (the denormalised
   * session counters aren't maintained). Mirrors the desktop `shiftFacts` so cloud and device
   * agree. All whole XAF.
   */
  private async shiftFacts(
    businessId: string,
    sessionId: string,
  ): Promise<{
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
  }> {
    const s = (await this.sessionsRepo.manager.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS n,
         COUNT(*) FILTER (WHERE status = 'VOIDED')::int AS voids,
         COALESCE(SUM(subtotal) FILTER (WHERE status = 'COMPLETED'), 0) AS gross,
         COALESCE(SUM(discount_amount) FILTER (WHERE status = 'COMPLETED'), 0) AS disc,
         COALESCE(SUM(total_amount) FILTER (WHERE status = 'COMPLETED'), 0) AS net,
         COALESCE(SUM(credit_amount) FILTER (WHERE status = 'COMPLETED'), 0) AS credit,
         COALESCE(SUM(change_given) FILTER (WHERE status = 'COMPLETED'), 0) AS change_given
       FROM sales
       WHERE cash_session_id = $1 AND business_id = $2 AND deleted_at IS NULL`,
      [sessionId, businessId],
    )) as Array<Record<string, string | number>>
    const t = (await this.sessionsRepo.manager.query(
      `SELECT
         COALESCE(SUM(sp.amount) FILTER (WHERE sp.method = 'CASH'), 0) AS cash,
         COALESCE(SUM(sp.amount) FILTER (WHERE sp.method = 'MTN_MOMO'), 0) AS mtn,
         COALESCE(SUM(sp.amount) FILTER (WHERE sp.method = 'ORANGE_MONEY'), 0) AS orange,
         COALESCE(SUM(sp.amount) FILTER (WHERE sp.method = 'CARD'), 0) AS card
       FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id
       WHERE s.cash_session_id = $1 AND s.business_id = $2
         AND s.status = 'COMPLETED' AND s.deleted_at IS NULL`,
      [sessionId, businessId],
    )) as Array<Record<string, string | number>>
    const m = (await this.movementsRepo.manager.query(
      `SELECT
         COALESCE(SUM(amount) FILTER (WHERE direction = 'IN'), 0) AS cin,
         COALESCE(SUM(amount) FILTER (WHERE direction = 'OUT'), 0) AS cout
       FROM cash_movements
       WHERE cash_session_id = $1 AND business_id = $2 AND deleted_at IS NULL`,
      [sessionId, businessId],
    )) as Array<Record<string, string | number>>
    const num = (v: unknown): number => Number(v ?? 0)
    return {
      salesCount: num(s[0]?.n),
      voidCount: num(s[0]?.voids),
      grossSales: num(s[0]?.gross),
      discountTotal: num(s[0]?.disc),
      netSales: num(s[0]?.net),
      creditIssued: num(s[0]?.credit),
      changeGiven: num(s[0]?.change_given),
      cash: num(t[0]?.cash),
      mtnMomo: num(t[0]?.mtn),
      orangeMoney: num(t[0]?.orange),
      card: num(t[0]?.card),
      movementsIn: num(m[0]?.cin),
      movementsOut: num(m[0]?.cout),
    }
  }

  /**
   * Z-report (per shift, at close) or X-report (mid-shift read of an open session) — BIZ-2.6.
   * Neutral money payload the client renders to a branded document. For a CLOSED shift the
   * drawer figures are the immutable close snapshot; for an open one, expected cash is live and
   * the count/variance are null (the count is blind, only taken at close).
   */
  async shiftReport(
    businessId: string,
    sessionId: string,
    kind: CashReportKind = 'Z',
  ): Promise<CashShiftReportData> {
    const session = await this.findById(sessionId, businessId)
    const f = await this.shiftFacts(businessId, sessionId)
    const liveExpected = computeExpectedCash({
      openingFloat: session.openingFloat,
      cashPayments: f.cash,
      changeGiven: f.changeGiven,
      cashIn: f.movementsIn,
      cashOut: f.movementsOut,
    })
    const closed = isCashSessionLocked(session.status)
    const expectedCash = closed ? (session.expectedCash ?? liveExpected) : liveExpected

    const moves = await this.movementsRepo.find({
      where: { cashSessionId: sessionId, businessId },
      order: { createdAt: 'ASC' },
    })

    return {
      kind,
      currency: 'XAF',
      sessionId: session.id,
      status: session.status,
      cashierName: await this.cashierName(session.userId),
      deviceId: session.deviceId ?? null,
      openedAt: toIso(session.openedAt),
      closedAt: session.closedAt ? toIso(session.closedAt) : null,
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
      movements: moves.map((mv) => ({
        kind: mv.kind,
        direction: mv.direction as 'IN' | 'OUT',
        amount: mv.amount,
        note: mv.note ?? null,
        createdAt: toIso(mv.createdAt),
      })),
      varianceReason: session.varianceReason ?? null,
      varianceNote: session.varianceNote ?? null,
      closingNote: session.closingNote ?? null,
    }
  }

  /**
   * Daily close (BIZ-2.6) — every shift for the business that opened within the day, plus
   * rolled-up totals, reconciled against the posted `daily_sale_summaries` (the one existing
   * daily aggregate — this endpoint reads it, it never builds a second one). Defaults to the
   * current UTC day.
   */
  async dailyReport(
    businessId: string,
    query: CashDailyReportQuery = {},
  ): Promise<CashDailyReportData> {
    const now = new Date()
    const startOfDay = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    ).toISOString()
    const fromIso = query.fromIso ?? startOfDay
    const toIso2 = query.toIso ?? new Date(new Date(fromIso).getTime() + 86_400_000).toISOString()

    const sessions = await this.sessionsRepo
      .createQueryBuilder('cs')
      .where('cs.business_id = :businessId', { businessId })
      .andWhere('cs.deleted_at IS NULL')
      .andWhere('cs.opened_at >= :from', { from: fromIso })
      .andWhere('cs.opened_at < :to', { to: toIso2 })
      .orderBy('cs.opened_at', 'DESC')
      .getMany()

    const shifts: CashDailyShiftLine[] = []
    const totals: CashDailyTotals = {
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
    }
    for (const session of sessions) {
      const f = await this.shiftFacts(businessId, session.id)
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
        cashierName: await this.cashierName(session.userId),
        status: session.status,
        openedAt: toIso(session.openedAt),
        closedAt: session.closedAt ? toIso(session.closedAt) : null,
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

    const reconciliation = await this.reconcileDaily(businessId, fromIso, toIso2, totals)

    return {
      currency: 'XAF',
      fromDate: fromIso,
      toDate: toIso2,
      generatedAt: now.toISOString(),
      shifts,
      totals,
      reconciliation,
    }
  }

  /**
   * Reconcile the shift-derived tender totals against the posted `daily_sale_summaries` for
   * the same day(s). `matches` is false when they diverge — typically because sales were rung
   * outside a cash session, which is exactly the gap a daily close should surface.
   */
  private async reconcileDaily(
    businessId: string,
    fromIso: string,
    toIso2: string,
    totals: CashDailyTotals,
  ): Promise<CashDailyReconciliation> {
    const row = (await this.sessionsRepo.manager.query(
      `SELECT
         COALESCE(SUM(total_revenue), 0) AS revenue,
         COALESCE(SUM(cash_collected), 0) AS cash,
         COALESCE(SUM(mtn_momo_collected), 0) AS mtn,
         COALESCE(SUM(orange_money_collected), 0) AS orange,
         COALESCE(SUM(card_collected), 0) AS card,
         COALESCE(SUM(credit_issued), 0) AS credit
       FROM daily_sale_summaries
       WHERE business_id = $1 AND summary_date >= $2::date AND summary_date < $3::date`,
      [businessId, fromIso, toIso2],
    )) as Array<Record<string, string | number>>
    const num = (v: unknown): number => Number(v ?? 0)
    const totalRevenue = num(row[0]?.revenue)
    const cashCollected = num(row[0]?.cash)
    const mtnMomoCollected = num(row[0]?.mtn)
    const orangeMoneyCollected = num(row[0]?.orange)
    const cardCollected = num(row[0]?.card)
    const creditIssued = num(row[0]?.credit)
    const close = (a: number, b: number): boolean => Math.abs(a - b) <= 1
    const matches =
      close(totals.netSales, totalRevenue) &&
      close(totals.cash, cashCollected) &&
      close(totals.mtnMomo, mtnMomoCollected) &&
      close(totals.orangeMoney, orangeMoneyCollected) &&
      close(totals.card, cardCollected) &&
      close(totals.creditIssued, creditIssued)
    return {
      totalRevenue,
      cashCollected,
      mtnMomoCollected,
      orangeMoneyCollected,
      cardCollected,
      creditIssued,
      matches,
    }
  }

  // --- Cash movements (BIZ-2.3) ---------------------------------------------

  async recordMovement(
    businessId: string,
    user: JwtPayload,
    sessionId: string,
    input: RecordCashMovementInput,
  ): Promise<CashMovement> {
    const session = await this.findById(sessionId, businessId)
    if (isCashSessionLocked(session.status)) {
      throw new AppBadRequestException(
        'This cash session is closed; no movements can be recorded.',
        'CASH_SESSION_LOCKED',
      )
    }
    const amount = Math.round(input.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new AppBadRequestException('Amount must be greater than 0.', 'CASH_MOVEMENT_AMOUNT')
    }
    return this.movementsRepo.save(
      this.movementsRepo.create({
        id: input.id,
        businessId,
        cashSessionId: sessionId,
        userId: user.sub,
        kind: input.kind,
        direction: cashMovementDirection(input.kind),
        amount,
        note: input.note ?? null,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
      }),
    )
  }

  async listMovements(businessId: string, sessionId: string): Promise<CashMovement[]> {
    return this.movementsRepo.find({
      where: { businessId, cashSessionId: sessionId },
      order: { createdAt: 'DESC' },
    })
  }

  async applyCashMovementOperation(
    businessId: string,
    payload: CashMovementSyncRecord,
  ): Promise<void> {
    // Movements are append-only; a re-push of the same id is a no-op.
    const existing = await this.movementsRepo.findOne({ where: { id: payload.id, businessId } })
    if (existing) return
    // The parent session must exist first (FK) — a missing parent defers on the client.
    const parent = await this.sessionsRepo.findOne({
      where: { id: payload.cashSessionId, businessId },
    })
    if (!parent) {
      throw new AppNotFoundException(
        'Cash session for this movement was not found.',
        'CASH_SESSION_NOT_FOUND',
      )
    }
    await this.movementsRepo.save(
      this.movementsRepo.create({
        id: payload.id,
        businessId,
        cashSessionId: payload.cashSessionId,
        userId: payload.userId,
        kind: payload.kind as CashMovementDto['kind'],
        direction: payload.direction as CashMovementDto['direction'],
        amount: payload.amount,
        note: payload.note ?? null,
        referenceType: payload.referenceType ?? null,
        referenceId: payload.referenceId ?? null,
        createdAt: new Date(payload.createdAt),
        updatedAt: new Date(payload.updatedAt),
      }),
    )
  }

  // --- Sync apply (device → server) -----------------------------------------

  async applyCashSessionOperation(
    businessId: string,
    payload: CashSessionSyncRecord,
  ): Promise<void> {
    const existing = await this.sessionsRepo.findOne({ where: { id: payload.id, businessId } })
    // A closed count is immutable — never let a later re-push mutate it.
    if (existing && isCashSessionLocked(existing.status)) return

    const row = {
      businessId,
      outletId: payload.outletId ?? null,
      deviceId: payload.deviceId,
      userId: payload.userId,
      status: payload.status as CashSessionStatus,
      openedAt: new Date(payload.openedAt),
      closedAt: payload.closedAt ? new Date(payload.closedAt) : null,
      openingFloat: payload.openingFloat,
      expectedCash: payload.expectedCash ?? null,
      countedCash: payload.countedCash ?? null,
      varianceCash: payload.varianceCash ?? null,
      expectedMtnMomo: payload.expectedMtnMomo ?? null,
      confirmedMtnMomo: payload.confirmedMtnMomo ?? null,
      expectedOrangeMoney: payload.expectedOrangeMoney ?? null,
      confirmedOrangeMoney: payload.confirmedOrangeMoney ?? null,
      creditIssued: payload.creditIssued,
      discountTotal: payload.discountTotal,
      salesCount: payload.salesCount,
      voidCount: payload.voidCount,
      closedReason: (payload.closedReason as CashSession['closedReason']) ?? null,
      recountUsed: payload.recountUsed,
      closingNote: payload.closingNote ?? null,
      varianceReason: payload.varianceReason ?? null,
      varianceNote: payload.varianceNote ?? null,
      reviewedBy: payload.reviewedBy ?? null,
      reviewedAt: payload.reviewedAt ? new Date(payload.reviewedAt) : null,
      reviewNote: payload.reviewNote ?? null,
      updatedAt: new Date(payload.updatedAt),
    }

    if (existing) {
      await this.sessionsRepo.update(existing.id, row)
    } else {
      await this.sessionsRepo.save(
        this.sessionsRepo.create({
          id: payload.id,
          createdAt: new Date(payload.createdAt),
          ...row,
        }),
      )
    }
  }

  async applyCashCountLineOperation(
    businessId: string,
    payload: CashCountLineSyncRecord,
  ): Promise<void> {
    // The line's parent session is business-scoped; guard the FK before writing.
    const parent = await this.sessionsRepo.findOne({
      where: { id: payload.cashSessionId, businessId },
    })
    if (!parent) {
      throw new AppNotFoundException(
        'Cash session for this count line was not found.',
        'CASH_SESSION_NOT_FOUND',
      )
    }

    const existing = await this.countLinesRepo.findOne({ where: { id: payload.id } })
    const row = {
      cashSessionId: payload.cashSessionId,
      denomination: payload.denomination,
      quantity: payload.quantity,
      updatedAt: new Date(payload.updatedAt),
    }
    if (existing) {
      await this.countLinesRepo.update(existing.id, row)
    } else {
      await this.countLinesRepo.save(
        this.countLinesRepo.create({
          id: payload.id,
          createdAt: new Date(payload.createdAt),
          ...row,
        }),
      )
    }
  }

  // --- Sync pull (server → device) ------------------------------------------

  async findByBusiness(
    businessId: string,
    cursor: Date,
    pulledAt: Date,
  ): Promise<{ sessions: CashSession[]; countLines: CashCountLine[]; movements: CashMovement[] }> {
    const sessions = await this.sessionsRepo
      .createQueryBuilder('cs')
      .where('cs.business_id = :businessId', { businessId })
      .andWhere('cs.updated_at > :cursor', { cursor })
      .andWhere('cs.updated_at <= :pulledAt', { pulledAt })
      .orderBy('cs.updated_at', 'ASC')
      .getMany()

    // Count lines carry no business_id, so scope them through their parent session.
    const countLines = await this.countLinesRepo
      .createQueryBuilder('ccl')
      .innerJoin(CashSession, 'cs', 'cs.id = ccl.cash_session_id')
      .where('cs.business_id = :businessId', { businessId })
      .andWhere('ccl.updated_at > :cursor', { cursor })
      .andWhere('ccl.updated_at <= :pulledAt', { pulledAt })
      .orderBy('ccl.updated_at', 'ASC')
      .getMany()

    const movements = await this.movementsRepo
      .createQueryBuilder('m')
      .where('m.business_id = :businessId', { businessId })
      .andWhere('m.updated_at > :cursor', { cursor })
      .andWhere('m.updated_at <= :pulledAt', { pulledAt })
      .orderBy('m.updated_at', 'ASC')
      .getMany()

    return { sessions, countLines, movements }
  }
}
