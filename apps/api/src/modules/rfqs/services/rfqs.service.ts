import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, IsNull, Repository } from 'typeorm'
import type { Logger } from '@biztrack/logger'
import { RfqStatus, RfqSupplierStatus } from '@biztrack/types'
import type { AuditContext, CreateRfqRequest, RecordRfqQuoteRequest, RfqDocument, RfqsQuery, SendRfqRequest } from '@biztrack/types'
import { renderRfqHtml, rfqMessageText } from '@biztrack/templates'
import { AppException } from '@/common/exceptions/app.exception'
import { AppBadRequestException, AppInternalServerException, AppNotFoundException } from '@/common/exceptions/app-exceptions'
import { Rfq } from '@/entities/rfq.entity'
import { RfqItem } from '@/entities/rfq-item.entity'
import { RfqSupplier } from '@/entities/rfq-supplier.entity'
import { Product } from '@/entities/product.entity'
import { Contact } from '@/entities/contact.entity'
import { Business } from '@/entities/business.entity'
import { toIsoString } from '@/common/http/serialization'
import { LOGGER } from '@/logger/logger.module'
import { AuditService } from '@/modules/audit/audit.service'
import { ProcurementSendService } from '@/modules/documents/procurement-send.service'

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
    @InjectRepository(Business) private readonly businessRepo: Repository<Business>,
    private readonly dataSource: DataSource,
    private readonly procurementSend: ProcurementSendService,
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
        ...(dto.quoteFileUrl !== undefined ? { quoteFileUrl: dto.quoteFileUrl } : {}),
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
      const biz = await this.businessRepo.findOne({ where: { id: businessId } })
      // Render + dispatch a copy addressed to each target supplier.
      for (const s of targets) {
        const doc = await this.buildDocument(rfq, s.supplierId, biz)
        await this.procurementSend.dispatch({
          businessId,
          html: renderRfqHtml(doc),
          message: rfqMessageText(doc),
          filename: `${doc.number}-${doc.supplier.name || 'supplier'}`,
          subject: `${doc.business.name} — ${doc.number}`,
          channels: dto.channels,
          phone: dto.recipient?.phone ?? doc.supplier.phone,
          email: dto.recipient?.email ?? doc.supplier.email,
        })
        if (s.status === RfqSupplierStatus.PENDING) await this.suppliersRepo.update(s.id, { status: RfqSupplierStatus.SENT })
      }
      if (rfq.status === RfqStatus.DRAFT) await this.rfqsRepo.update(rfq.id, { status: RfqStatus.SENT })
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

  /** Render the RFQ (addressed to one supplier) to a PDF buffer (download / blob). */
  async getDocumentPdf(id: string, businessId: string, supplierId: string): Promise<Buffer> {
    const rfq = await this.findById(id, businessId)
    const biz = await this.businessRepo.findOne({ where: { id: businessId } })
    const doc = await this.buildDocument(rfq, supplierId, biz)
    return this.procurementSend.renderPdf(renderRfqHtml(doc))
  }

  /** Mark an RFQ as CONVERTED (a PO was created from one of its quotes). */
  async markConverted(id: string, businessId: string): Promise<void> {
    await this.rfqsRepo.update({ id, businessId }, { status: RfqStatus.CONVERTED })
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

  private async buildDocument(rfq: Rfq, supplierId: string, biz: Business | null): Promise<RfqDocument> {
    const supplier = await this.contactsRepo.findOne({ where: { id: supplierId } })
    return {
      number: rfq.number,
      title: rfq.title ?? null,
      issuedDate: (toIsoString(rfq.createdAt) ?? '').slice(0, 10),
      currency: rfq.currency,
      business: { name: biz?.name ?? 'BizTrack', phone: biz?.phone ?? null, email: biz?.email ?? null, address: biz?.address ?? null, logoUrl: biz?.logoUrl ?? null },
      supplier: { name: supplier?.name ?? '', phone: supplier?.phone ?? null, email: null, address: supplier?.address ?? null },
      items: (rfq.items ?? []).map((it) => ({ description: it.description, sku: null, quantity: Number(it.quantity) })),
      messageBody: rfq.messageBody ?? null,
    }
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
