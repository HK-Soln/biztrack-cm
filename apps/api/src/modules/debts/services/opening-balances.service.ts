import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { Logger, LogMetadata } from '@biztrack/logger'
import {
  ContactType,
  DebtDirection,
  DebtSource,
  DebtStatus,
  type AgeingEntry,
  type AgeingReport,
  type ContactNetPosition,
  type ContactOpeningBalance,
  type JwtPayload,
  type UpsertOpeningBalanceRequest,
} from '@biztrack/types'
import { I18nService } from 'nestjs-i18n'
import { In, Repository } from 'typeorm'
import { AppException } from '@/common/exceptions/app.exception'
import {
  AppBadRequestException,
  AppInternalServerException,
  AppNotFoundException,
} from '@/common/exceptions/app-exceptions'
import { toIsoString } from '@/common/http/serialization'
import { ContactOpeningBalance as ContactOpeningBalanceEntity } from '@/entities/contact-opening-balance.entity'
import { Contact } from '@/entities/contact.entity'
import { Debt } from '@/entities/debt.entity'
import type { I18nTranslations } from '@/i18n/i18n.types'
import { LOGGER } from '@/logger/logger.module'

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/

/**
 * Every opening balance is mirrored as a `debt` row (sourceType=OPENING_BALANCE) so it can be
 * paid through the normal debt-payment machinery. The natural key is
 * (business, OPENING_BALANCE, contactId, direction) — `sourceId = contactId` is deterministic
 * and identical on desktop + cloud, so a locally-created and an API-created opening-balance debt
 * converge to one row on sync instead of duplicating. Aggregations (net position, ageing,
 * statement, contact summary) read the opening balance from this debt, never double-counting the
 * `contact_opening_balances` amount on top of it.
 */
const OPENING_BALANCE_DEBT_REFERENCE = 'Opening balance'

@Injectable()
export class OpeningBalancesService {
  constructor(
    @InjectRepository(ContactOpeningBalanceEntity)
    private readonly openingBalancesRepo: Repository<ContactOpeningBalanceEntity>,
    @InjectRepository(Contact)
    private readonly contactsRepo: Repository<Contact>,
    @InjectRepository(Debt)
    private readonly debtsRepo: Repository<Debt>,
    private readonly i18n: I18nService<I18nTranslations>,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    this.logger.setContext('OpeningBalancesService')
  }

  async upsert(
    contactId: string,
    businessId: string,
    dto: UpsertOpeningBalanceRequest,
    user: JwtPayload,
  ): Promise<ContactOpeningBalance> {
    try {
      const contact = await this.requireContact(contactId, businessId)
      this.assertDirectionCompatibleWithType(contact.type as ContactType, dto.direction)
      this.assertDateOnly(dto.asOfDate)

      const amount = this.roundMoney(dto.amount)
      if (amount <= 0) {
        throw new AppBadRequestException(
          await this.i18n.translate('errors.opening_balance_amount_invalid' as never),
          'OPENING_BALANCE_AMOUNT_INVALID',
        )
      }

      const existing = await this.openingBalancesRepo.findOne({
        where: { businessId, contactId, direction: dto.direction },
      })

      if (existing) {
        await this.openingBalancesRepo.update(existing.id, {
          amount,
          asOfDate: dto.asOfDate,
          notes: dto.notes?.trim() || null,
          recordedById: user.sub,
          updatedAt: new Date(),
        })
        await this.materializeDebt(businessId, contactId, dto.direction, amount, dto.asOfDate)
        const updated = await this.openingBalancesRepo.findOneOrFail({ where: { id: existing.id } })
        return this.toModel(updated)
      }

      const created = await this.openingBalancesRepo.save(
        this.openingBalancesRepo.create({
          businessId,
          contactId,
          direction: dto.direction,
          amount,
          asOfDate: dto.asOfDate,
          notes: dto.notes?.trim() || null,
          recordedById: user.sub,
        }),
      )
      await this.materializeDebt(businessId, contactId, dto.direction, amount, dto.asOfDate)
      return this.toModel(created)
    } catch (error) {
      return this.handleServiceError('upsert', error, { contactId, businessId })
    }
  }

  async findAllForContact(contactId: string, businessId: string): Promise<ContactOpeningBalance[]> {
    try {
      await this.requireContact(contactId, businessId)
      const rows = await this.openingBalancesRepo.find({
        where: { businessId, contactId },
        order: { direction: 'ASC' },
      })
      return rows.map((row) => this.toModel(row))
    } catch (error) {
      return this.handleServiceError('findAllForContact', error, { contactId, businessId })
    }
  }

  async delete(contactId: string, businessId: string, direction: DebtDirection): Promise<void> {
    try {
      await this.requireContact(contactId, businessId)
      const existing = await this.openingBalancesRepo.findOne({
        where: { businessId, contactId, direction },
      })

      if (!existing) {
        throw new AppNotFoundException(
          await this.i18n.translate('errors.opening_balance_not_found' as never),
          'OPENING_BALANCE_NOT_FOUND',
        )
      }

      await this.openingBalancesRepo.delete(existing.id)
      // Drop the mirrored debt (its payments cascade via the debt_payments FK).
      await this.debtsRepo.delete({
        businessId,
        sourceType: DebtSource.OPENING_BALANCE,
        sourceId: contactId,
        direction,
      })
    } catch (error) {
      return this.handleServiceError('delete', error, { contactId, businessId, direction })
    }
  }

  /**
   * Create or update the debt that mirrors a contact's opening balance. Idempotent on the
   * natural key (business, OPENING_BALANCE, contactId, direction); `createdAt` is pinned to the
   * opening-balance date so the debt sorts to the top of the account statement. On amount change
   * the debt status is recomputed from any payments already recorded against it.
   */
  private async materializeDebt(
    businessId: string,
    contactId: string,
    direction: DebtDirection,
    amount: number,
    asOfDate: string,
  ): Promise<void> {
    const existing = await this.debtsRepo.findOne({
      where: { businessId, sourceType: DebtSource.OPENING_BALANCE, sourceId: contactId, direction },
      relations: ['payments'],
    })

    if (existing) {
      const paid = this.roundMoney((existing.payments ?? []).reduce((sum, p) => sum + p.amount, 0))
      const settled = paid >= amount - 1e-6
      existing.originalAmount = amount
      existing.sourceReference = OPENING_BALANCE_DEBT_REFERENCE
      existing.status =
        existing.status === DebtStatus.WRITTEN_OFF
          ? DebtStatus.WRITTEN_OFF
          : settled
            ? DebtStatus.SETTLED
            : paid > 0
              ? DebtStatus.PARTIALLY_PAID
              : DebtStatus.OUTSTANDING
      existing.settledAt = settled ? (existing.settledAt ?? new Date()) : null
      await this.debtsRepo.save(existing)
      return
    }

    await this.debtsRepo.save(
      this.debtsRepo.create({
        businessId,
        contactId,
        direction,
        sourceType: DebtSource.OPENING_BALANCE,
        sourceId: contactId,
        sourceReference: OPENING_BALANCE_DEBT_REFERENCE,
        originalAmount: amount,
        status: DebtStatus.OUTSTANDING,
        // Pin to the opening-balance date so it precedes later transactions in the statement.
        createdAt: new Date(`${asOfDate}T00:00:00.000Z`),
      }),
    )
  }

  async getNetPosition(contactId: string, businessId: string): Promise<ContactNetPosition> {
    try {
      const contact = await this.requireContact(contactId, businessId)

      // The opening balance is now a debt (sourceType=OPENING_BALANCE), so everything derives
      // from debts — the opening balance is separated out only for reporting, never added on top.
      const debts = await this.debtsRepo.find({
        where: { businessId, contactId },
        relations: ['payments'],
      })

      let receivableOb = 0
      let payableOb = 0
      let receivableDebts = 0
      let receivablePaid = 0
      let payableDebts = 0
      let payablePaid = 0

      for (const debt of debts) {
        if (debt.status === DebtStatus.WRITTEN_OFF) continue
        const paid = this.roundMoney((debt.payments ?? []).reduce((sum, p) => sum + p.amount, 0))
        const outstanding = this.roundMoney(Math.max(0, debt.originalAmount - paid))
        const isOpening = debt.sourceType === DebtSource.OPENING_BALANCE

        if (debt.direction === DebtDirection.RECEIVABLE) {
          if (isOpening) receivableOb = this.roundMoney(receivableOb + outstanding)
          else receivableDebts = this.roundMoney(receivableDebts + outstanding)
          receivablePaid = this.roundMoney(receivablePaid + paid)
        } else {
          if (isOpening) payableOb = this.roundMoney(payableOb + outstanding)
          else payableDebts = this.roundMoney(payableDebts + outstanding)
          payablePaid = this.roundMoney(payablePaid + paid)
        }
      }

      const receivableNet = this.roundMoney(receivableOb + receivableDebts)
      const payableNet = this.roundMoney(payableOb + payableDebts)

      return {
        contact: {
          id: contact.id,
          name: contact.name,
          phone: contact.phone ?? null,
        },
        receivable: {
          openingBalance: receivableOb,
          totalDebts: receivableDebts,
          totalPaid: receivablePaid,
          netBalance: receivableNet,
        },
        payable: {
          openingBalance: payableOb,
          totalDebts: payableDebts,
          totalPaid: payablePaid,
          netBalance: payableNet,
        },
        net: this.roundMoney(receivableNet - payableNet),
      }
    } catch (error) {
      return this.handleServiceError('getNetPosition', error, { contactId, businessId })
    }
  }

  async getAgeingReport(businessId: string, direction: DebtDirection): Promise<AgeingReport> {
    try {
      const now = new Date()
      const today = now.toISOString().slice(0, 10)

      const debts = await this.debtsRepo.find({
        where: {
          businessId,
          direction,
          status: In([DebtStatus.OUTSTANDING, DebtStatus.PARTIALLY_PAID]),
        },
        relations: ['contact', 'payments'],
      })

      const contactMap = new Map<
        string,
        {
          contact: Contact
          openingBalance: number
          current: number
          moderate: number
          aged: number
          overdue: number
          total: number
        }
      >()

      for (const debt of debts) {
        if (!debt.contact) continue
        const paid = this.roundMoney((debt.payments ?? []).reduce((sum, p) => sum + p.amount, 0))
        const outstanding = this.roundMoney(Math.max(0, debt.originalAmount - paid))
        if (outstanding <= 0) continue

        const entry = contactMap.get(debt.contactId) ?? {
          contact: debt.contact,
          openingBalance: 0,
          current: 0,
          moderate: 0,
          aged: 0,
          overdue: 0,
          total: 0,
        }

        // The opening balance keeps its own column (not aged); every other debt is bucketed by age.
        if (debt.sourceType === DebtSource.OPENING_BALANCE) {
          entry.openingBalance = this.roundMoney(entry.openingBalance + outstanding)
        } else {
          const ageDays = this.daysBetween(debt.createdAt, now)
          if (ageDays <= 7) {
            entry.current = this.roundMoney(entry.current + outstanding)
          } else if (ageDays <= 15) {
            entry.moderate = this.roundMoney(entry.moderate + outstanding)
          } else if (ageDays <= 30) {
            entry.aged = this.roundMoney(entry.aged + outstanding)
          } else {
            entry.overdue = this.roundMoney(entry.overdue + outstanding)
          }
          entry.total = this.roundMoney(entry.total + outstanding)
        }
        contactMap.set(debt.contactId, entry)
      }

      const entries: AgeingEntry[] = [...contactMap.values()].map((e) => ({
        contactId: e.contact.id,
        contactName: e.contact.name,
        contactPhone: e.contact.phone ?? null,
        openingBalance: e.openingBalance,
        current: e.current,
        moderate: e.moderate,
        aged: e.aged,
        overdue: e.overdue,
        totalOutstanding: this.roundMoney(e.openingBalance + e.total),
      }))

      entries.sort((a, b) => b.totalOutstanding - a.totalOutstanding)

      const totals = entries.reduce(
        (acc, e) => ({
          openingBalance: this.roundMoney(acc.openingBalance + e.openingBalance),
          current: this.roundMoney(acc.current + e.current),
          moderate: this.roundMoney(acc.moderate + e.moderate),
          aged: this.roundMoney(acc.aged + e.aged),
          overdue: this.roundMoney(acc.overdue + e.overdue),
          totalOutstanding: this.roundMoney(acc.totalOutstanding + e.totalOutstanding),
        }),
        { openingBalance: 0, current: 0, moderate: 0, aged: 0, overdue: 0, totalOutstanding: 0 },
      )

      return { direction, asOf: today, entries, totals }
    } catch (error) {
      return this.handleServiceError('getAgeingReport', error, { businessId, direction })
    }
  }

  async findForContactAndDirection(
    contactId: string,
    businessId: string,
    direction: DebtDirection,
  ): Promise<ContactOpeningBalanceEntity | null> {
    return this.openingBalancesRepo.findOne({
      where: { businessId, contactId, direction },
    })
  }

  async findMapForContacts(
    businessId: string,
    contactIds: string[],
  ): Promise<Map<string, { receivable: number; payable: number }>> {
    const result = new Map<string, { receivable: number; payable: number }>()
    if (contactIds.length === 0) return result

    const rows = await this.openingBalancesRepo.find({
      where: { businessId, contactId: In(contactIds) },
    })

    for (const row of rows) {
      const entry = result.get(row.contactId) ?? { receivable: 0, payable: 0 }
      if (row.direction === DebtDirection.RECEIVABLE) {
        entry.receivable = this.roundMoney(row.amount)
      } else {
        entry.payable = this.roundMoney(row.amount)
      }
      result.set(row.contactId, entry)
    }

    return result
  }

  private toModel(entity: ContactOpeningBalanceEntity): ContactOpeningBalance {
    return {
      id: entity.id,
      contactId: entity.contactId,
      businessId: entity.businessId,
      direction: entity.direction,
      amount: entity.amount,
      asOfDate: entity.asOfDate,
      notes: entity.notes ?? null,
      recordedById: entity.recordedById ?? null,
      createdAt: toIsoString(entity.createdAt) ?? '',
      updatedAt: toIsoString(entity.updatedAt) ?? '',
    }
  }

  private async requireContact(contactId: string, businessId: string): Promise<Contact> {
    const contact = await this.contactsRepo.findOne({ where: { id: contactId, businessId } })
    if (!contact) {
      throw new AppNotFoundException(
        await this.i18n.translate('errors.contact_not_found' as never),
        'CONTACT_NOT_FOUND',
      )
    }
    return contact
  }

  private assertDirectionCompatibleWithType(type: ContactType, direction: DebtDirection) {
    if (direction === DebtDirection.RECEIVABLE && type === ContactType.SUPPLIER) {
      throw new AppBadRequestException(
        'Supplier contacts can only have payable opening balances',
        'OPENING_BALANCE_DIRECTION_INVALID',
      )
    }
    if (direction === DebtDirection.PAYABLE && type === ContactType.CUSTOMER) {
      throw new AppBadRequestException(
        'Customer contacts can only have receivable opening balances',
        'OPENING_BALANCE_DIRECTION_INVALID',
      )
    }
  }

  private assertDateOnly(value: string) {
    if (!DATE_ONLY_REGEX.test(value)) {
      throw new AppBadRequestException(
        'Opening balance date must be in YYYY-MM-DD format',
        'OPENING_BALANCE_DATE_INVALID',
      )
    }
  }

  private daysBetween(createdAt: Date, now: Date): number {
    const msPerDay = 1000 * 60 * 60 * 24
    return Math.floor((now.getTime() - createdAt.getTime()) / msPerDay)
  }

  private roundMoney(value: number) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100
  }

  private async handleServiceError(
    action: string,
    error: unknown,
    metadata?: LogMetadata,
  ): Promise<never> {
    if (error instanceof AppException) {
      this.logger.warn('OpeningBalancesService error', 'OpeningBalancesService', {
        action,
        code: error.code,
        status: error.getStatus(),
        ...(metadata ?? {}),
      })
      throw error
    }

    this.logger.error('OpeningBalancesService unexpected error', 'OpeningBalancesService', {
      action,
      message: error instanceof Error ? error.message : 'Unknown error',
      ...(metadata ?? {}),
    })

    throw new AppInternalServerException(
      await this.i18n.translate('errors.server_error' as never),
      'OPENING_BALANCES_SERVICE_ERROR',
      { action },
    )
  }
}
