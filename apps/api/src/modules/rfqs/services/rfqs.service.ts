import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, IsNull, Repository } from 'typeorm'
import type { Logger } from '@biztrack/logger'
import { RfqStatus, RfqSupplierStatus } from '@biztrack/types'
import type { AuditContext, CreateRfqRequest, RecordRfqQuoteRequest, RfqsQuery, SendRfqRequest } from '@biztrack/types'
import { AppException } from '@/common/exceptions/app.exception'
import { AppBadRequestException, AppInternalServerException, AppNotFoundException } from '@/common/exceptions/app-exceptions'
import { Rfq } from '@/entities/rfq.entity'
import { RfqItem } from '@/entities/rfq-item.entity'
import { RfqSupplier } from '@/entities/rfq-supplier.entity'
import { Product } from '@/entities/product.entity'
import { Contact } from '@/entities/contact.entity'
import { LOGGER } from '@/logger/logger.module'
import { AuditService } from '@/modules/audit/audit.service'

/**
 * Requests for Quotation — REST counterpart of the desktop offline RFQ service so the
 * cloud app manages RFQs the same way. Send marks suppliers/RFQ as sent; the automatic
 * PDF + WhatsApp/email dispatch is wired with the shared document pipeline (Slice 4).
 */
@Injectable()
export class RfqsService {
  constructor(
    @InjectRepository(Rfq) private readonly rfqsRepo: Repository<Rfq>,
    @InjectRepository(RfqItem) private readonly itemsRepo: Repository<RfqItem>,
    @InjectRepository(RfqSupplier) private readonly suppliersRepo: Repository<RfqSupplier>,
    @InjectRepository(Product) private readonly productsRepo: Repository<Product>,
    @InjectRepository(Contact) private readonly contactsRepo: Repository<Contact>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    this.logger.setContext('RfqsService')
  }

  async list(businessId: string, query: RfqsQuery) {
    try {
      const page = Math.max(query.page ?? 1, 1)
      const limit = Math.min(Math.max(query.limit ?? 20, 1), 100)
      const sortColumn = query.sortBy === 'number' ? 'r.number' : 'r.created_at'
      const order = query.sortOrder === 'ASC' ? 'ASC' : 'DESC'

      const qb = this.rfqsRepo
        .createQueryBuilder('r')
        .leftJoinAndSelect('r.items', 'i', 'i.deleted_at IS NULL')
        .leftJoinAndSelect('r.suppliers', 's', 's.deleted_at IS NULL')
        .where('r.business_id = :businessId AND r.deleted_at IS NULL', { businessId })
      if (query.search) qb.andWhere('(r.number ILIKE :s OR r.title ILIKE :s)', { s: `%${query.search}%` })
      if (query.status) qb.andWhere('r.status = :status', { status: query.status })
      if (query.supplierId) {
        qb.andWhere('EXISTS (SELECT 1 FROM rfq_suppliers rs WHERE rs.rfq_id = r.id AND rs.supplier_id = :sid)', { sid: query.supplierId })
      }
      const [data, total] = await qb
        .orderBy(sortColumn, order)
        .skip((page - 1) * limit)
        .take(limit)
        .getManyAndCount()
      return { data, total, page, limit, totalPages: Math.ceil(total / limit) }
    } catch (error) {
      return this.handleServiceError('list', error, { businessId })
    }
  }

  async findById(id: string, businessId: string): Promise<Rfq> {
    const rfq = await this.rfqsRepo.findOne({
      where: { id, businessId, deletedAt: IsNull() },
      relations: { items: true, suppliers: true },
    })
    if (!rfq) throw new AppNotFoundException('Request for quotation not found.', 'RFQ_NOT_FOUND')
    return rfq
  }

  async create(businessId: string, dto: CreateRfqRequest, context: AuditContext): Promise<Rfq> {
    try {
      if (!dto.items?.length) throw new AppBadRequestException('Add at least one item.', 'RFQ_ITEMS_REQUIRED')
      if (!dto.supplierIds?.length) throw new AppBadRequestException('Select at least one supplier.', 'RFQ_SUPPLIERS_REQUIRED')

      const number = await this.nextNumber(businessId)
      const id = await this.dataSource.transaction(async (manager) => {
        const rfq = await manager.getRepository(Rfq).save(
          manager.getRepository(Rfq).create({
            businessId,
            number,
            title: dto.title?.trim() || null,
            messageBody: dto.messageBody?.trim() || null,
            status: RfqStatus.DRAFT,
            currency: dto.currency || 'XAF',
            createdById: context.actorId ?? null,
          }),
        )
        for (const it of dto.items) {
          const description = it.description?.trim() || (await this.describeProduct(it.productId))
          await manager.getRepository(RfqItem).save(
            manager.getRepository(RfqItem).create({
              rfqId: rfq.id,
              productId: it.productId,
              variantId: it.variantId ?? null,
              description,
              quantity: it.quantity,
            }),
          )
        }
        for (const supplierId of dto.supplierIds) {
          await manager.getRepository(RfqSupplier).save(
            manager.getRepository(RfqSupplier).create({
              rfqId: rfq.id,
              supplierId,
              supplierName: await this.contactName(supplierId),
              status: RfqSupplierStatus.PENDING,
            }),
          )
        }
        return rfq.id
      })

      this.auditService.log(context, {
        action: 'CREATE',
        entityType: 'rfq',
        entityId: id,
        entityLabel: number,
        changes: { before: null, after: { number, items: dto.items.length, suppliers: dto.supplierIds.length } },
      })
      return this.findById(id, businessId)
    } catch (error) {
      return this.handleServiceError('create', error, { businessId })
    }
  }

  async recordQuote(id: string, businessId: string, dto: RecordRfqQuoteRequest, context: AuditContext): Promise<Rfq> {
    try {
      const rfq = await this.findById(id, businessId)
      const supplier = (rfq.suppliers ?? []).find((s) => s.id === dto.rfqSupplierId)
      if (!supplier) throw new AppBadRequestException('Supplier is not on this request.', 'RFQ_SUPPLIER_NOT_FOUND')

      await this.suppliersRepo.update(supplier.id, {
        status: RfqSupplierStatus.QUOTED,
        quotedTotal: dto.quotedTotal,
        quoteNotes: dto.quoteNotes?.trim() || null,
        respondedAt: new Date(),
      })
      if (rfq.status === RfqStatus.DRAFT || rfq.status === RfqStatus.SENT) {
        await this.rfqsRepo.update(rfq.id, { status: RfqStatus.QUOTED })
      }
      this.auditService.log(context, {
        action: 'UPDATE',
        entityType: 'rfq',
        entityId: id,
        entityLabel: rfq.number,
        changes: { before: null, after: { quote: dto.quotedTotal, supplier: dto.rfqSupplierId } },
      })
      return this.findById(id, businessId)
    } catch (error) {
      return this.handleServiceError('recordQuote', error, { businessId, id })
    }
  }

  async send(id: string, businessId: string, dto: SendRfqRequest, context: AuditContext): Promise<Rfq> {
    try {
      const rfq = await this.findById(id, businessId)
      const targets = (rfq.suppliers ?? []).filter((s) =>
        dto.supplierIds?.length ? dto.supplierIds.includes(s.supplierId) : s.status === RfqSupplierStatus.PENDING,
      )
      for (const s of targets) {
        if (s.status === RfqSupplierStatus.PENDING) await this.suppliersRepo.update(s.id, { status: RfqSupplierStatus.SENT })
      }
      if (rfq.status === RfqStatus.DRAFT) await this.rfqsRepo.update(rfq.id, { status: RfqStatus.SENT })
      // TODO(Slice 4): render the shared PO/RFQ template → PDF (chromium) → dispatch via
      // NotificationsService (Resend email / WAHA WhatsApp) to each target supplier.
      this.auditService.log(context, {
        action: 'UPDATE',
        entityType: 'rfq',
        entityId: id,
        entityLabel: rfq.number,
        changes: { before: { status: rfq.status }, after: { status: 'SENT', channels: dto.channels, sentTo: targets.length } },
      })
      return this.findById(id, businessId)
    } catch (error) {
      return this.handleServiceError('send', error, { businessId, id })
    }
  }

  // ---- internals -----------------------------------------------------------

  private async nextNumber(businessId: string): Promise<string> {
    const count = await this.rfqsRepo.count({ where: { businessId } })
    return `RFQ-${String(count + 1).padStart(5, '0')}`
  }

  private async describeProduct(productId: string): Promise<string> {
    const p = await this.productsRepo.findOne({ where: { id: productId }, select: { id: true, name: true } })
    return p?.name ?? 'Item'
  }

  private async contactName(contactId: string): Promise<string | null> {
    const c = await this.contactsRepo.findOne({ where: { id: contactId }, select: { id: true, name: true } })
    return c?.name ?? null
  }

  private handleServiceError(operation: string, error: unknown, meta: Record<string, unknown>): never {
    if (error instanceof AppException) throw error
    this.logger.error('RfqsService unexpected error', 'RfqsService', {
      operation,
      message: error instanceof Error ? error.message : 'Unknown error',
      ...meta,
    })
    throw new AppInternalServerException('Could not complete the request.', 'RFQ_OPERATION_FAILED')
  }
}
