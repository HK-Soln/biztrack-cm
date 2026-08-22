import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { computeBusinessDate } from '@biztrack/utils'
import { Business } from '@/entities/business.entity'
import { CashSession } from '@/entities/cash-session.entity'

/**
 * BIZ-5.1 — resolves the local trading day (`business_date`) a transaction belongs to, the
 * one authoritative place the rule lives on the API. A transaction rung inside a cash shift
 * inherits the shift's business_date (so a shift straddling the cutover keeps one day);
 * otherwise it is computed from the business timezone + cutover. Stamp the result at write
 * time — never recompute at read (the cutover is a mutable setting).
 */
@Injectable()
export class BusinessCalendarService {
  constructor(
    @InjectRepository(Business) private readonly businessRepo: Repository<Business>,
    @InjectRepository(CashSession) private readonly sessionRepo: Repository<CashSession>,
  ) {}

  /** business_date for a transaction at `instant`. Inherits the shift's day when a
   *  cashSessionId is given and that shift has one; else computes from the business calendar. */
  async businessDateFor(
    businessId: string,
    instant: Date | string | number,
    cashSessionId?: string | null,
  ): Promise<string> {
    if (cashSessionId) {
      const session = await this.sessionRepo.findOne({
        where: { id: cashSessionId },
        select: ['id', 'businessDate'],
      })
      if (session?.businessDate) return session.businessDate
    }
    return this.computeForBusiness(businessId, instant)
  }

  /** business_date for a synced row: trust a value the origin device already stamped, else
   *  compute from the (authoritative) business calendar — so a device that hasn't cached the
   *  cutover yet still lands the correct server value. */
  async resolveForSync(
    businessId: string,
    instant: Date | string | number,
    provided?: string | null,
    cashSessionId?: string | null,
  ): Promise<string> {
    if (provided) return provided
    return this.businessDateFor(businessId, instant, cashSessionId)
  }

  /** Raw compute from the business timezone + cutover, ignoring any shift. */
  async computeForBusiness(businessId: string, instant: Date | string | number): Promise<string> {
    const business = await this.businessRepo.findOne({
      where: { id: businessId },
      select: ['id', 'timezone', 'dayCutoverTime'],
    })
    return computeBusinessDate(instant, {
      timezone: business?.timezone,
      cutover: business?.dayCutoverTime,
    })
  }
}
