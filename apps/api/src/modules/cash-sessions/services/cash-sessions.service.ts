import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  CashSessionStatus,
  canTransitionCashSession,
  isCashSessionLocked,
  type CashCountLineSyncRecord,
  type CashSessionSyncRecord,
  type JwtPayload,
  type PaginatedResult,
} from '@biztrack/types'
import { AppBadRequestException, AppNotFoundException } from '@/common/exceptions/app-exceptions'
import { CashSession } from '@/entities/cash-session.entity'
import { CashCountLine } from '@/entities/cash-count-line.entity'
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
  ): Promise<{ sessions: CashSession[]; countLines: CashCountLine[] }> {
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

    return { sessions, countLines }
  }
}
