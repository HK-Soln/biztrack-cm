import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, Repository } from 'typeorm'
import { PeriodStatus } from '@biztrack/types'
import { AccountingPeriod } from '@/entities/accounting-period.entity'

/** The accounting day a financial transaction posts to, plus whether it was a late (prior-period)
 *  arrival and which period it originally belonged to. */
export interface PostingDateResult {
  postingDate: string
  isLateArrival: boolean
  originalPeriodId: string | null
}

/**
 * BIZ-5.4 — resolves a transaction's `posting_date` from its operational `business_date`.
 *
 * Normally the two are equal. But if the period covering the business_date was already
 * CLOSED/LOCKED when the transaction landed (e.g. it synced up days late, after month-end close),
 * posting it back there would silently change a closed period's totals — not allowed. Instead the
 * transaction is redated forward to the earliest still-open period (a prior-period adjustment),
 * flagged `is_late_arrival`, and keeps a pointer to the period it belonged to. Stamp at write time.
 */
@Injectable()
export class PostingDateService {
  constructor(
    @InjectRepository(AccountingPeriod)
    private readonly periodRepo: Repository<AccountingPeriod>,
  ) {}

  async resolve(
    businessId: string,
    businessDate: string,
    manager?: EntityManager,
  ): Promise<PostingDateResult> {
    const repo = manager ? manager.getRepository(AccountingPeriod) : this.periodRepo

    // The period that owns the transaction's operational day.
    const owning = await repo
      .createQueryBuilder('p')
      .where('p.business_id = :businessId', { businessId })
      .andWhere('p.start_date <= :d AND p.end_date >= :d', { d: businessDate })
      .getOne()

    // No fiscal calendar covering this day → nothing to redate against; post on its own day.
    if (!owning) return { postingDate: businessDate, isLateArrival: false, originalPeriodId: null }

    // Still accepting entries → posts on its real day.
    if (owning.status === PeriodStatus.OPEN || owning.status === PeriodStatus.CLOSING) {
      return { postingDate: businessDate, isLateArrival: false, originalPeriodId: null }
    }

    // Period is CLOSED/LOCKED → redate forward to the earliest still-open period (the current one,
    // in normal sequential-close operation).
    const target = await repo
      .createQueryBuilder('p')
      .where('p.business_id = :businessId', { businessId })
      .andWhere('p.status = :open', { open: PeriodStatus.OPEN })
      .andWhere('p.start_date > :end', { end: owning.endDate })
      .orderBy('p.start_date', 'ASC')
      .getOne()

    // Everything from the closed period onward is also closed — nowhere open to post the
    // adjustment. Degrade to the real day without flagging (a stamped period can't reopen here).
    if (!target) return { postingDate: businessDate, isLateArrival: false, originalPeriodId: null }

    return { postingDate: target.startDate, isLateArrival: true, originalPeriodId: owning.id }
  }
}
