import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { Logger, LogMetadata } from '@biztrack/logger'
import {
  ContactType,
  DebtDirection,
  DebtStatus,
  type ContactDetail,
  type ContactListItem,
  type ContactListResult,
  type ContactsQuery,
  type ContactsSummary,
  type DebtsQuery,
  type JwtPayload,
} from '@biztrack/types'
import { I18nService } from 'nestjs-i18n'
import { Brackets, In, IsNull, Not, Repository } from 'typeorm'
import { AppException } from '@/common/exceptions/app.exception'
import {
  AppBadRequestException,
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
      let totalReceivable = 0
      let totalPayable = 0
      let debtorCount = 0
      let creditorCount = 0
      let customerCount = 0
      let supplierCount = 0
      for (const c of contacts) {
        const s = map.get(c.id)
        const r = s?.totalReceivable ?? 0
        const p = s?.totalPayable ?? 0
        totalReceivable += r
        totalPayable += p
        if (r > 0) debtorCount += 1
        if (p > 0) creditorCount += 1
        if (c.type === ContactType.CUSTOMER || c.type === ContactType.BOTH) customerCount += 1
        if (c.type === ContactType.SUPPLIER || c.type === ContactType.BOTH) supplierCount += 1
      }
      return {
        totalReceivable: this.roundMoney(totalReceivable),
        totalPayable: this.roundMoney(totalPayable),
        allCount: contacts.length,
        customerCount,
        supplierCount,
        debtorCount,
        creditorCount,
      }
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
    },
  ) {
    try {
      const name = dto.name.trim()
      const phone = await this.normalizeRequiredPhone(dto.phone)
      const phoneAlt = await this.normalizeOptionalPhone(dto.phoneAlt)
      const email = this.normalizeOptionalString(dto.email)
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

      const existing = await this.findByPrimaryPhone(businessId, phone)
      if (existing) {
        if (!existing.isActive) {
          // Reactivating an archived contact consumes a slot again because the
          // quota counts only active contacts.
          await this.quotaService.assertWithinQuota(businessId, 'contacts')
        }

        if (existing.type === ContactType.BOTH) {
          return this.reuseExistingContact(existing, businessId, {
            type: ContactType.BOTH,
            phoneAlt,
            email,
            address,
            notes,
          })
        }

        if (existing.type === dto.type) {
          throw new AppBadRequestException(
            await this.i18n.translate('errors.contact_already_exists' as never),
            'CONTACT_ALREADY_EXISTS',
          )
        }

        return this.reuseExistingContact(existing, businessId, {
          type: ContactType.BOTH,
          phoneAlt,
          email,
          address,
          notes,
        })
      }

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

      await this.contactsRepo.update(id, {
        type: dto.type ?? contact.type,
        name: dto.name?.trim() ?? contact.name,
        phone:
          dto.phone === undefined
            ? (contact.phone ?? null)
            : await this.normalizeOptionalPhone(dto.phone),
        phoneAlt:
          dto.phoneAlt === undefined
            ? (contact.phoneAlt ?? null)
            : await this.normalizeOptionalPhone(dto.phoneAlt),
        email:
          dto.email === undefined
            ? (contact.email ?? null)
            : this.normalizeOptionalString(dto.email),
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
        where: {
          businessId,
          contactId: id,
          status: In([DebtStatus.OUTSTANDING, DebtStatus.PARTIALLY_PAID]),
        },
      })

      if (blockingDebtCount > 0) {
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

    for (const debt of debts) {
      const summary = result.get(debt.contactId)
      if (!summary) continue

      const totalPaid = this.roundMoney(
        (debt.payments ?? []).reduce((sum, payment) => sum + payment.amount, 0),
      )
      const rawOutstanding = this.roundMoney(Math.max(0, debt.originalAmount - totalPaid))

      if (debt.status !== DebtStatus.WRITTEN_OFF) {
        if (debt.direction === DebtDirection.RECEIVABLE) {
          summary.totalReceivable = this.roundMoney(summary.totalReceivable + rawOutstanding)
        } else {
          summary.totalPayable = this.roundMoney(summary.totalPayable + rawOutstanding)
        }
      }

      if ([DebtStatus.OUTSTANDING, DebtStatus.PARTIALLY_PAID].includes(debt.status)) {
        summary.openDebts += 1
        const created = toIsoString(debt.createdAt) ?? null
        if (created && (!summary.oldestUnpaidAt || created < summary.oldestUnpaidAt)) {
          summary.oldestUnpaidAt = created
        }
      }

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

  private async findByPrimaryPhone(businessId: string, phone: string, excludeId?: string) {
    const rows = await this.contactsRepo.find({
      where: excludeId
        ? {
            businessId,
            phone: Not(IsNull()),
            id: Not(excludeId),
          }
        : {
            businessId,
            phone: Not(IsNull()),
          },
      order: {
        updatedAt: 'DESC',
        createdAt: 'DESC',
      },
    })

    const normalizedPhone = this.normalizePhoneForLookup(phone)
    return rows.find((row) => this.normalizePhoneForLookup(row.phone) === normalizedPhone) ?? null
  }

  private async reuseExistingContact(
    contact: Contact,
    businessId: string,
    input: {
      type: ContactType
      phoneAlt: string | null
      email: string | null
      address: string | null
      notes: string | null
    },
  ) {
    const nextPhoneAlt = contact.phoneAlt ?? input.phoneAlt
    const nextEmail = contact.email ?? input.email
    const nextAddress = contact.address ?? input.address
    const nextNotes = contact.notes ?? input.notes
    const shouldUpdate =
      contact.type !== input.type ||
      !contact.isActive ||
      nextPhoneAlt !== (contact.phoneAlt ?? null) ||
      nextEmail !== (contact.email ?? null) ||
      nextAddress !== (contact.address ?? null) ||
      nextNotes !== (contact.notes ?? null)

    if (shouldUpdate) {
      await this.contactsRepo.update(contact.id, {
        type: input.type,
        phoneAlt: nextPhoneAlt,
        email: nextEmail,
        address: nextAddress,
        notes: nextNotes,
        isActive: true,
        updatedAt: new Date(),
      })
    }

    return this.findById(contact.id, businessId)
  }

  private normalizePhoneForLookup(value: string | null | undefined) {
    const trimmed = value?.trim() || ''
    if (!trimmed) {
      return null
    }

    const digits = trimmed.replace(/\D/g, '')
    if (!digits) {
      return null
    }

    return trimmed.startsWith('+') ? `+${digits}` : digits
  }

  private async normalizeOptionalPhone(value?: string | null) {
    const normalized = this.normalizePhoneForLookup(value)
    if (!normalized) {
      return null
    }

    if (normalized.length < 5 || normalized.length > 30) {
      throw new AppBadRequestException(
        await this.i18n.translate('errors.contact_phone_invalid' as never),
        'CONTACT_PHONE_INVALID',
      )
    }

    return normalized
  }

  private async normalizeRequiredPhone(value?: string | null) {
    const normalized = await this.normalizeOptionalPhone(value)
    if (!normalized) {
      throw new AppBadRequestException(
        await this.i18n.translate('errors.contact_phone_invalid' as never),
        'CONTACT_PHONE_INVALID',
      )
    }

    return normalized
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
