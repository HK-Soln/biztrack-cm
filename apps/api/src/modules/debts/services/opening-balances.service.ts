import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { Logger, LogMetadata } from '@biztrack/logger'
import {
  ContactType,
  DebtDirection,
  DebtSource,
  DebtStatus,
  clampCreditDays,
  type AgeingReport,
  type ContactNetPosition,
  type ContactOpeningBalance,
  type JwtPayload,
  type UpsertOpeningBalanceRequest,
} from '@biztrack/types'
import {
  buildAgeingReport,
  checkOpeningBalance,
  contactNetPosition,
  debtAfterChange,
  OPEN_DEBT_STATUSES,
  toWholeXaf,
} from '@biztrack/domain'
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
import { Business } from '@/entities/business.entity'
import { Contact } from '@/entities/contact.entity'
import { Debt } from '@/entities/debt.entity'
import { BusinessCalendarService } from '@/modules/business-calendar/business-calendar.service'
import type { I18nTranslations } from '@/i18n/i18n.types'
import { LOGGER } from '@/logger/logger.module'

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
    private readonly calendar: BusinessCalendarService,
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
      // Amount, date and direction: @biztrack/domain checkOpeningBalance, as sync and the till.
      const checked = checkOpeningBalance({
        amount: dto.amount,
        direction: dto.direction,
        contactType: contact.type as ContactType,
        asOfDate: dto.asOfDate,
      })
      if (!checked.ok) {
        throw new AppBadRequestException(
          {
            OPENING_BALANCE_AMOUNT_INVALID: await this.i18n.translate(
              'errors.opening_balance_amount_invalid' as never,
            ),
            OPENING_BALANCE_DIRECTION_INVALID:
              contact.type === ContactType.SUPPLIER
                ? 'Supplier contacts can only have payable opening balances'
                : 'Customer contacts can only have receivable opening balances',
            OPENING_BALANCE_DATE_INVALID: 'Opening balance date must be in YYYY-MM-DD format',
          }[checked.code],
          checked.code,
        )
      }
      const { amount } = checked

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

      // Local trading day (BIZ-5.1) from the business timezone + cutover.
      const businessDate = await this.calendar.computeForBusiness(businessId, dto.asOfDate)
      const created = await this.openingBalancesRepo.save(
        this.openingBalancesRepo.create({
          businessId,
          contactId,
          direction: dto.direction,
          amount,
          asOfDate: dto.asOfDate,
          notes: dto.notes?.trim() || null,
          recordedById: user.sub,
          businessDate,
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
      // Where the debt now stands (@biztrack/domain debtAfterChange, as the till).
      const next = debtAfterChange({
        originalAmount: amount,
        paidAmount: (existing.payments ?? []).reduce((sum, p) => sum + p.amount, 0),
        status: existing.status,
        settledAt: existing.settledAt,
        at: new Date(),
      })
      existing.originalAmount = amount
      existing.sourceReference = OPENING_BALANCE_DEBT_REFERENCE
      existing.status = next.status
      existing.settledAt = next.settledAt
      await this.debtsRepo.save(existing)
      return
    }

    // Local trading day (BIZ-5.1) for the mirrored debt, from the opening-balance date.
    const businessDate = await this.calendar.computeForBusiness(businessId, asOfDate)
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
        businessDate,
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

      // The net position is @biztrack/domain's (contactNetPosition).
      return {
        contact: {
          id: contact.id,
          name: contact.name,
          phone: contact.phone ?? null,
        },
        ...contactNetPosition(
          debts.map((debt) => ({
            ...debt,
            dueDate: debt.dueDate ?? null,
            paidAmount: (debt.payments ?? []).reduce((sum, p) => sum + p.amount, 0),
          })),
        ),
      }
    } catch (error) {
      return this.handleServiceError('getNetPosition', error, { contactId, businessId })
    }
  }

  async getAgeingReport(businessId: string, direction: DebtDirection): Promise<AgeingReport> {
    try {
      const now = new Date()

      // D9: bucket every debt off its EFFECTIVE due date — the explicit due_date, or
      // created_at + the business's default credit period when none was set.
      const business = await this.debtsRepo.manager.getRepository(Business).findOne({
        where: { id: businessId },
        select: ['id', 'defaultCreditDays'],
      })
      const creditDays = clampCreditDays(business?.defaultCreditDays)

      const debts = await this.debtsRepo.find({
        where: { businessId, direction, status: In([...OPEN_DEBT_STATUSES]) },
        relations: ['contact', 'payments'],
      })

      // The buckets, totals and order are @biztrack/domain's (buildAgeingReport), as the till.
      const contacts = new Map<string, { name: string; phone: string | null }>()
      for (const debt of debts) {
        if (debt.contact) {
          contacts.set(debt.contactId, {
            name: debt.contact.name,
            phone: debt.contact.phone ?? null,
          })
        }
      }
      return buildAgeingReport({
        direction,
        creditDays,
        now,
        contacts,
        debts: debts.map((debt) => ({
          ...debt,
          dueDate: debt.dueDate ?? null,
          paidAmount: (debt.payments ?? []).reduce((sum, p) => sum + p.amount, 0),
        })),
      })
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
        entry.receivable = toWholeXaf(row.amount)
      } else {
        entry.payable = toWholeXaf(row.amount)
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

  private daysBetween(createdAt: Date, now: Date): number {
    const msPerDay = 1000 * 60 * 60 * 24
    return Math.floor((now.getTime() - createdAt.getTime()) / msPerDay)
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
