import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  CashSessionClosedReason,
  CashSessionStatus,
  canTransitionCashSession,
  cashMovementDirection,
  isCashSessionLocked,
  type CashCountLineSyncRecord,
  type CashMovement as CashMovementDto,
  type CashMovementSyncRecord,
  type CashSessionExpectedCash,
  type CashSessionSyncRecord,
  type CloseCashSessionInput,
  type JwtPayload,
  type PaginatedResult,
  type RecordCashMovementInput,
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
