import {
  checkContactArchive,
  checkContactInput,
  contactBalances,
  contactNameKey,
  contactsSummary,
  findContactClashes,
  mergeContact,
  normalizeEmail,
  normalizePhone,
  OPEN_DEBT_STATUSES,
} from '@biztrack/domain'
import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { Logger, LogMetadata } from '@biztrack/logger'
import {
  ContactType,
  DebtDirection,
  type ContactDetail,
  type ContactListItem,
  type ContactListResult,
  type ContactsQuery,
  type ContactsSummary,
  type DebtsQuery,
  type JwtPayload,
} from '@biztrack/types'
import { I18nService } from 'nestjs-i18n'
import { Brackets, In, Repository } from 'typeorm'
import { AppException } from '@/common/exceptions/app.exception'
import {
  AppBadRequestException,
  AppConflictException,
  AppInternalServerException,
  AppNotFoundException,
} from '@/common/exceptions/app-exceptions'
import { toIsoString } from '@/common/http/serialization'
import { Contact } from '@/entities/contact.entity'
import { Debt } from '@/entities/debt.entity'
import type { I18nTranslations } from '@/i18n/i18n.types'
import { LOGGER } from '@/logger/logger.module'
import { QuotaService } from '@/modules/permissions/quota.service'
import { DebtsService } from './debts.service'
import { OpeningBalancesService } from './opening-balances.service'

@Injectable()
export class ContactsService {
  constructor(
    @InjectRepository(Contact)
    private readonly contactsRepo: Repository<Contact>,
    @InjectRepository(Debt)
    private readonly debtsRepo: Repository<Debt>,
    private readonly debtsService: DebtsService,
    private readonly openingBalancesService: OpeningBalancesService,
    private readonly quotaService: QuotaService,
    private readonly i18n: I18nService<I18nTranslations>,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    this.logger.setContext('ContactsService')
  }

  async findAll(businessId: string, query: ContactsQuery): Promise<ContactListResult> {
    try {
      const qb = this.contactsRepo
        .createQueryBuilder('contact')
        .leftJoinAndSelect('contact.createdBy', 'createdBy')
        .where('contact.business_id = :businessId', { businessId })

      if (query.type) {
        qb.andWhere('contact.type = :type', { type: query.type })
      }

      if (query.isActive !== undefined) {
        qb.andWhere('contact.is_active = :isActive', { isActive: query.isActive })
      }

      if (query.balance === 'debtor' || query.balance === 'creditor') {
        // Match desktop: contacts with an open debt in the given direction.
        const balDir = query.balance === 'debtor' ? DebtDirection.RECEIVABLE : DebtDirection.PAYABLE
        qb.andWhere(
          `EXISTS (SELECT 1 FROM debts d WHERE d.contact_id = contact.id AND d.direction = :balDir AND d.status IN ('OUTSTANDING','PARTIALLY_PAID'))`,
          { balDir },
        )
      }

      if (query.search?.trim()) {
        const search = `%${query.search.trim().toLowerCase()}%`
        qb.andWhere(
          new Brackets((builder) => {
            builder
              .where('LOWER(contact.name) LIKE :search', { search })
              .orWhere("LOWER(COALESCE(contact.phone, '')) LIKE :search", { search })
              .orWhere("LOWER(COALESCE(contact.phone_alt, '')) LIKE :search", { search })
          }),
        )
      }

      const sort = this.resolveSortField(query.sortBy)
      const sortOrder = query.sortOrder ?? 'ASC'
      const page = Math.max(query.page ?? 1, 1)
      const limit = Math.min(Math.max(query.limit ?? 20, 1), 100)
      const skip = (page - 1) * limit

      const [rows, total] = await qb
        .orderBy(sort, sortOrder)
        .skip(skip)
        .take(limit)
        .getManyAndCount()
      const summaryMap = await this.buildSummaryMap(
        businessId,
        rows.map((row) => row.id),
      )

      return {
        data: rows.map((row) => this.toContactModel(row, summaryMap.get(row.id))),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }
    } catch (error) {
      return this.handleServiceError('findAll', error, { businessId })
    }
  }

  /** Aggregate balances + per-tab counts for the contacts list header. */
  async summary(businessId: string): Promise<ContactsSummary> {
    try {
      const contacts = await this.contactsRepo.find({
        where: { businessId, isActive: true },
        select: { id: true, type: true },
      })
      const map = await this.buildSummaryMap(
        businessId,
        contacts.map((c) => c.id),
      )
      // The header's balances and counts are @biztrack/domain's (contactsSummary), as the till.
      return contactsSummary(
        contacts.map((c) => ({
          type: c.type,
          isActive: true,
          totalReceivable: map.get(c.id)?.totalReceivable ?? 0,
          totalPayable: map.get(c.id)?.totalPayable ?? 0,
        })),
      )
    } catch (error) {
      return this.handleServiceError('summary', error, { businessId })
    }
  }

  async findById(id: string, businessId: string): Promise<ContactDetail> {
    try {
      const contact = await this.contactsRepo.findOne({
        where: { id, businessId },
        relations: ['createdBy'],
      })

      if (!contact) {
        throw new AppNotFoundException(
          await this.i18n.translate('errors.contact_not_found' as never),
          'CONTACT_NOT_FOUND',
        )
      }

      const summaryMap = await this.buildSummaryMap(businessId, [contact.id])
      return this.toContactModel(contact, summaryMap.get(contact.id))
    } catch (error) {
      return this.handleServiceError('findById', error, { id, businessId })
    }
  }

  async create(
    businessId: string,
    user: JwtPayload,
    dto: {
      type: Contact['type']
      name: string
      phone?: string
      phoneAlt?: string
      email?: string
      address?: string
      notes?: string
      idType?: Contact['idType']
      idNumber?: string | null
      idIssueDate?: string | null
      idExpiryDate?: string | null
      idDocuments?: string[] | null
      selfieUrl?: string | null
      onDuplicate?: 'MERGE' | 'CREATE'
    },
  ) {
    try {
      // Only a name is required; phones are optional and valid when given (R16).
      await this.assertContactInput(dto)
      const name = dto.name.trim()
      const phone = normalizePhone(dto.phone)
      const phoneAlt = normalizePhone(dto.phoneAlt)
      const email = normalizeEmail(dto.email)
      const address = this.normalizeOptionalString(dto.address)
      const notes = this.normalizeOptionalString(dto.notes)
      const kyc = {
        idType: dto.idType ?? null,
        idNumber: this.normalizeOptionalString(dto.idNumber),
        idIssueDate: this.normalizeOptionalString(dto.idIssueDate),
        idExpiryDate: this.normalizeOptionalString(dto.idExpiryDate),
        idDocuments: dto.idDocuments?.length ? dto.idDocuments : null,
        selfieUrl: this.normalizeOptionalString(dto.selfieUrl),
      }

      // A phone or email already on another contact is refused unless the person chose to
      // merge or to create anyway; a name already taken is always refused (R16).
      const others = await this.contactsRepo.find({ where: { businessId } })
      const clashes = findContactClashes({ name, phone, email }, others)
      const duplicate = clashes.duplicates[0]
      if (duplicate && dto.onDuplicate !== 'CREATE') {
        if (dto.onDuplicate !== 'MERGE') {
          throw new AppConflictException(
            await this.i18n.translate('errors.contact_duplicate' as never),
            'CONTACT_DUPLICATE',
            duplicate,
          )
        }
        const target = others.find((other) => other.id === duplicate.contactId)!
        const merged = mergeContact(target, {
          type: dto.type,
          name,
          phone,
          phoneAlt,
          email,
          address,
          notes,
        })
        await this.assertNameFree(businessId, merged.name, target.id, others)
        if (!target.isActive) await this.quotaService.assertWithinQuota(businessId, 'contacts')
        await this.contactsRepo.update(target.id, {
          type: merged.type as ContactType,
          name: merged.name,
          nameKey: contactNameKey(merged.name),
          phone: merged.phone ?? null,
          phoneAlt: merged.phoneAlt ?? null,
          email: merged.email ?? null,
          address: merged.address ?? null,
          notes: merged.notes ?? null,
          isActive: true,
          updatedAt: new Date(),
        })
        return this.findById(target.id, businessId)
      }
      await this.assertNameFree(businessId, name, null, others)

      await this.quotaService.assertWithinQuota(businessId, 'contacts')

      const contact = await this.contactsRepo.save(
        this.contactsRepo.create({
          businessId,
          type: dto.type,
          name,
          phone,
          phoneAlt,
          email,
          address,
          notes,
          ...kyc,
          isActive: true,
          createdById: user.sub,
        }),
      )

      return this.findById(contact.id, businessId)
    } catch (error) {
      return this.handleServiceError('create', error, { businessId, userId: user.sub })
    }
  }

  async update(
    id: string,
    businessId: string,
    dto: {
      type?: Contact['type']
      name?: string
      phone?: string
      phoneAlt?: string
      email?: string
      address?: string
      notes?: string
      idType?: Contact['idType']
      idNumber?: string | null
      idIssueDate?: string | null
      idExpiryDate?: string | null
      idDocuments?: string[] | null
      selfieUrl?: string | null
    },
  ) {
    try {
      const contact = await this.contactsRepo.findOne({ where: { id, businessId } })

      if (!contact) {
        throw new AppNotFoundException(
          await this.i18n.translate('errors.contact_not_found' as never),
          'CONTACT_NOT_FOUND',
        )
      }

      const nextName = dto.name?.trim() ?? contact.name
      await this.assertContactInput({
        name: nextName,
        phone: dto.phone,
        phoneAlt: dto.phoneAlt,
        email: dto.email,
      })
      if (contactNameKey(nextName) !== contact.nameKey) {
        await this.assertNameFree(businessId, nextName, contact.id)
      }

      await this.contactsRepo.update(id, {
        type: dto.type ?? contact.type,
        name: nextName,
        nameKey: contactNameKey(nextName),
        phone: dto.phone === undefined ? (contact.phone ?? null) : normalizePhone(dto.phone),
        phoneAlt:
          dto.phoneAlt === undefined ? (contact.phoneAlt ?? null) : normalizePhone(dto.phoneAlt),
        email: dto.email === undefined ? (contact.email ?? null) : normalizeEmail(dto.email),
        address:
          dto.address === undefined
            ? (contact.address ?? null)
            : this.normalizeOptionalString(dto.address),
        notes:
          dto.notes === undefined
            ? (contact.notes ?? null)
            : this.normalizeOptionalString(dto.notes),
        idType: dto.idType === undefined ? (contact.idType ?? null) : (dto.idType ?? null),
        idNumber:
          dto.idNumber === undefined
            ? (contact.idNumber ?? null)
            : this.normalizeOptionalString(dto.idNumber),
        idIssueDate:
          dto.idIssueDate === undefined
            ? (contact.idIssueDate ?? null)
            : this.normalizeOptionalString(dto.idIssueDate),
        idExpiryDate:
          dto.idExpiryDate === undefined
            ? (contact.idExpiryDate ?? null)
            : this.normalizeOptionalString(dto.idExpiryDate),
        idDocuments:
          dto.idDocuments === undefined
            ? (contact.idDocuments ?? null)
            : dto.idDocuments?.length
              ? dto.idDocuments
              : null,
        selfieUrl:
          dto.selfieUrl === undefined
            ? (contact.selfieUrl ?? null)
            : this.normalizeOptionalString(dto.selfieUrl),
        updatedAt: new Date(),
      })

      return this.findById(id, businessId)
    } catch (error) {
      return this.handleServiceError('update', error, { id, businessId })
    }
  }

  async remove(id: string, businessId: string): Promise<void> {
    try {
      const contact = await this.contactsRepo.findOne({ where: { id, businessId } })

      if (!contact) {
        throw new AppNotFoundException(
          await this.i18n.translate('errors.contact_not_found' as never),
          'CONTACT_NOT_FOUND',
        )
      }

      const blockingDebtCount = await this.debtsRepo.count({
        where: { businessId, contactId: id, status: In([...OPEN_DEBT_STATUSES]) },
      })

      // One with open debts cannot be archived (@biztrack/domain, as sync and the till).
      if (
        checkContactArchive({
          wasActive: contact.isActive,
          isActive: false,
          hasOpenDebts: blockingDebtCount > 0,
        })
      ) {
        throw new AppBadRequestException(
          await this.i18n.translate('errors.contact_has_open_debts' as never),
          'CONTACT_HAS_OPEN_DEBTS',
          { blockingDebtCount },
        )
      }

      await this.contactsRepo.update(id, { isActive: false, updatedAt: new Date() })
    } catch (error) {
      return this.handleServiceError('remove', error, { id, businessId })
    }
  }

  async getDebts(id: string, businessId: string, query: DebtsQuery) {
    await this.findById(id, businessId)
    return this.debtsService.findAllForContact(id, businessId, query)
  }

  async getStatement(id: string, businessId: string, direction?: DebtDirection) {
    await this.findById(id, businessId)
    return this.debtsService.buildContactStatement(id, businessId, direction)
  }

  private resolveSortField(field?: string) {
    // Entity PROPERTY paths (not raw columns): findAll joins createdBy + paginates, so
    // TypeORM resolves orderBy against entity metadata — raw columns (contact.created_at)
    // break it with a databaseName error.
    const sortMap: Record<string, string> = {
      name: 'contact.name',
      type: 'contact.type',
      createdAt: 'contact.createdAt',
      updatedAt: 'contact.updatedAt',
    }

    return sortMap[field ?? ''] ?? 'contact.name'
  }

  private async buildSummaryMap(businessId: string, contactIds: string[]) {
    const result = new Map<
      string,
      {
        totalReceivable: number
        totalPayable: number
        openDebts: number
        lastTransactionDate: string | null
        oldestUnpaidAt: string | null
      }
    >()

    if (contactIds.length === 0) return result

    // Opening balances are now OPENING_BALANCE debts, so they're included in this debt scan —
    // no separate opening-balance seeding (that would double-count).
    const debts = await this.debtsRepo.find({
      where: { businessId, contactId: In(contactIds) },
      relations: ['payments'],
    })

    for (const contactId of contactIds) {
      result.set(contactId, {
        totalReceivable: 0,
        totalPayable: 0,
        openDebts: 0,
        lastTransactionDate: null,
        oldestUnpaidAt: null,
      })
    }

    // Each contact's balance, open debts and oldest open debt are @biztrack/domain's
    // (contactBalances), as the till.
    const balances = contactBalances(
      debts.map((debt) => ({
        ...debt,
        dueDate: debt.dueDate ?? null,
        paidAmount: (debt.payments ?? []).reduce((sum, payment) => sum + payment.amount, 0),
      })),
    )
    for (const [contactId, balance] of balances) {
      const summary = result.get(contactId)
      if (summary) Object.assign(summary, balance)
    }

    for (const debt of debts) {
      const summary = result.get(debt.contactId)
      if (!summary) continue

      summary.lastTransactionDate = this.maxDate(
        summary.lastTransactionDate,
        this.toDateOnly(debt.createdAt),
      )
      summary.lastTransactionDate = this.maxDate(
        summary.lastTransactionDate,
        debt.settledAt ? this.toDateOnly(debt.settledAt) : null,
      )
      summary.lastTransactionDate = this.maxDate(
        summary.lastTransactionDate,
        debt.writtenOffAt ? this.toDateOnly(debt.writtenOffAt) : null,
      )

      for (const payment of debt.payments ?? []) {
        summary.lastTransactionDate = this.maxDate(summary.lastTransactionDate, payment.paymentDate)
      }
    }

    return result
  }

  private toContactModel(
    contact: Contact & { createdBy?: { id: string; name: string } | null },
    summary?: {
      totalReceivable: number
      totalPayable: number
      openDebts: number
      lastTransactionDate: string | null
      oldestUnpaidAt: string | null
    },
  ): ContactListItem {
    return {
      id: contact.id,
      businessId: contact.businessId,
      type: contact.type,
      name: contact.name,
      phone: contact.phone ?? null,
      phoneAlt: contact.phoneAlt ?? null,
      email: contact.email ?? null,
      address: contact.address ?? null,
      notes: contact.notes ?? null,
      idType: contact.idType ?? null,
      idNumber: contact.idNumber ?? null,
      idIssueDate: contact.idIssueDate ?? null,
      idExpiryDate: contact.idExpiryDate ?? null,
      idDocuments: contact.idDocuments ?? null,
      selfieUrl: contact.selfieUrl ?? null,
      isActive: contact.isActive,
      createdById: contact.createdById,
      createdBy: contact.createdBy
        ? {
            id: contact.createdBy.id,
            name: contact.createdBy.name,
          }
        : null,
      createdAt: toIsoString(contact.createdAt) ?? '',
      updatedAt: toIsoString(contact.updatedAt) ?? '',
      totalReceivable: summary?.totalReceivable ?? 0,
      totalPayable: summary?.totalPayable ?? 0,
      openDebts: summary?.openDebts ?? 0,
      lastTransactionDate: summary?.lastTransactionDate ?? null,
      oldestUnpaidAt: summary?.oldestUnpaidAt ?? null,
    }
  }

  private maxDate(current: string | null, candidate: string | null) {
    if (!candidate) return current
    if (!current) return candidate
    return candidate > current ? candidate : current
  }

  private toDateOnly(value: Date | string) {
    if (typeof value === 'string') return value.slice(0, 10)
    return value.toISOString().slice(0, 10)
  }

  private normalizeOptionalString(value?: string | null) {
    const trimmed = value?.trim()
    return trimmed ? trimmed : null
  }

  /** A name, valid phones and email when given (@biztrack/domain checkContactInput). */
  private async assertContactInput(input: {
    name?: string | null
    phone?: string | null
    phoneAlt?: string | null
    email?: string | null
  }): Promise<void> {
    const problem = checkContactInput(input)
    if (!problem) return
    const key = {
      CONTACT_NAME_REQUIRED: 'errors.contact_name_required',
      CONTACT_PHONE_INVALID: 'errors.contact_phone_invalid',
      CONTACT_EMAIL_INVALID: 'errors.contact_email_invalid',
    }[problem]
    throw new AppBadRequestException(await this.i18n.translate(key as never), problem)
  }

  /** The name is free in the business (R16); `selfId` is the contact being saved, if any. */
  private async assertNameFree(
    businessId: string,
    name: string,
    selfId: string | null,
    loaded?: Contact[],
  ): Promise<void> {
    const others = loaded ?? (await this.contactsRepo.find({ where: { businessId } }))
    const { nameTaken } = findContactClashes({ name, selfId }, others)
    if (nameTaken) {
      throw new AppConflictException(
        await this.i18n.translate('errors.contact_name_taken' as never),
        'CONTACT_NAME_TAKEN',
        { contactId: nameTaken.id, name: nameTaken.name },
      )
    }
  }

  private async handleServiceError(
    action: string,
    error: unknown,
    metadata?: LogMetadata,
  ): Promise<never> {
    if (error instanceof AppException) {
      this.logger.warn('ContactsService error', 'ContactsService', {
        action,
        code: error.code,
        status: error.getStatus(),
        ...(metadata ?? {}),
      })
      throw error
    }

    this.logger.error('ContactsService unexpected error', 'ContactsService', {
      action,
      message: error instanceof Error ? error.message : 'Unknown error',
      ...(metadata ?? {}),
    })

    throw new AppInternalServerException(
      await this.i18n.translate('errors.server_error' as never),
      'CONTACTS_SERVICE_ERROR',
      { action },
    )
  }
}
