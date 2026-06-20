import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, IsNull, Repository } from 'typeorm'
import type { Logger } from '@biztrack/logger'
import { PurchaseOrderStatus } from '@biztrack/types'
import type { AuditContext, ConvertRfqToPoRequest, CreatePurchaseOrderRequest, PurchaseOrderDocument, PurchaseOrdersQuery, SendPurchaseOrderRequest } from '@biztrack/types'
import { purchaseOrderMessageText, renderPurchaseOrderHtml } from '@biztrack/templates'
import { AppException } from '@/common/exceptions/app.exception'
import { AppBadRequestException, AppInternalServerException, AppNotFoundException } from '@/common/exceptions/app-exceptions'
import { PurchaseOrder } from '@/entities/purchase-order.entity'
import { PurchaseOrderItem } from '@/entities/purchase-order-item.entity'
import { Product } from '@/entities/product.entity'
import { Contact } from '@/entities/contact.entity'
import { Business } from '@/entities/business.entity'
import { toIsoString } from '@/common/http/serialization'
import { LOGGER } from '@/logger/logger.module'
import { AuditService } from '@/modules/audit/audit.service'
import { RfqsService } from '@/modules/rfqs/services/rfqs.service'
import { ProcurementSendService } from '@/modules/documents/procurement-send.service'

interface PoLineInput {
  productId: string
  variantId?: string | null
  description: string
  quantity: number
  unitPrice: number
}

/**
 * Purchase Orders — REST counterpart of the desktop offline PO service. Created from
 * scratch or from a chosen RFQ quote. Send marks the PO sent; the PDF + WhatsApp/email
 * dispatch is handled by the procurement send pipeline.
 */
@Injectable()
export class PurchaseOrdersService {
  constructor(
    @InjectRepository(PurchaseOrder) private readonly poRepo: Repository<PurchaseOrder>,
    @InjectRepository(PurchaseOrderItem) private readonly itemsRepo: Repository<PurchaseOrderItem>,
    @InjectRepository(Product) private readonly productsRepo: Repository<Product>,
    @InjectRepository(Contact) private readonly contactsRepo: Repository<Contact>,
    @InjectRepository(Business) private readonly businessRepo: Repository<Business>,
    private readonly dataSource: DataSource,
    private readonly rfqsService: RfqsService,
    private readonly procurementSend: ProcurementSendService,
    private readonly auditService: AuditService,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    this.logger.setContext('PurchaseOrdersService')
  }

  async list(businessId: string, query: PurchaseOrdersQuery) {
    try {
      const page = Math.max(query.page ?? 1, 1)
      const limit = Math.min(Math.max(query.limit ?? 20, 1), 100)
      const sortColumn = query.sortBy === 'number' ? 'p.number' : 'p.created_at'
      const order = query.sortOrder === 'ASC' ? 'ASC' : 'DESC'

      const qb = this.poRepo
        .createQueryBuilder('p')
        .leftJoinAndSelect('p.items', 'i', 'i.deleted_at IS NULL')
        .where('p.business_id = :businessId AND p.deleted_at IS NULL', { businessId })
      if (query.search) qb.andWhere('(p.number ILIKE :s OR p.title ILIKE :s OR p.supplier_name ILIKE :s)', { s: `%${query.search}%` })
      if (query.status) qb.andWhere('p.status = :status', { status: query.status })
      if (query.supplierId) qb.andWhere('p.supplier_id = :sid', { sid: query.supplierId })
      if (query.rfqId) qb.andWhere('p.rfq_id = :rid', { rid: query.rfqId })
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

  async findById(id: string, businessId: string): Promise<PurchaseOrder> {
    const po = await this.poRepo.findOne({ where: { id, businessId, deletedAt: IsNull() }, relations: { items: true } })
    if (!po) throw new AppNotFoundException('Purchase order not found.', 'PURCHASE_ORDER_NOT_FOUND')
    return po
  }

  async create(businessId: string, dto: CreatePurchaseOrderRequest, context: AuditContext): Promise<PurchaseOrder> {
    try {
      if (!dto.items?.length) throw new AppBadRequestException('Add at least one item.', 'PO_ITEMS_REQUIRED')
      const lines: PoLineInput[] = []
      for (const it of dto.items) {
        if (!Number.isFinite(it.quantity) || it.quantity <= 0) throw new AppBadRequestException('Each item needs a quantity greater than 0.', 'PO_ITEM_QTY_INVALID')
        lines.push({
          productId: it.productId,
          variantId: it.variantId ?? null,
          description: it.description?.trim() || (await this.describeProduct(it.productId)),
          quantity: it.quantity,
          unitPrice: it.unitPrice ?? 0,
        })
      }
      if (lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0) <= 0) throw new AppBadRequestException('The order total must be greater than 0.', 'PO_TOTAL_ZERO')
      const id = await this.insert(businessId, {
        rfqId: dto.rfqId ?? null,
        supplierId: dto.supplierId,
        title: dto.title?.trim() || null,
        messageBody: dto.messageBody?.trim() || null,
        currency: dto.currency || 'XAF',
        expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : null,
        createdById: context.actorId ?? null,
        lines,
      })
      this.auditService.log(context, { action: 'CREATE', entityType: 'purchase_order', entityId: id, entityLabel: '', changes: { before: null, after: { supplierId: dto.supplierId, items: lines.length } } })
      return this.findById(id, businessId)
    } catch (error) {
      return this.handleServiceError('create', error, { businessId })
    }
  }

  async createFromRfq(businessId: string, rfqId: string, dto: ConvertRfqToPoRequest, context: AuditContext): Promise<PurchaseOrder> {
    try {
      const rfq = await this.rfqsService.findById(rfqId, businessId)
      const supplier = (rfq.suppliers ?? []).find((s) => s.id === dto.rfqSupplierId)
      if (!supplier) throw new AppBadRequestException('Supplier is not on this request.', 'RFQ_SUPPLIER_NOT_FOUND')
      if (!dto.items?.length) throw new AppBadRequestException('Add at least one item to the order.', 'PO_ITEMS_REQUIRED')

      const lines: PoLineInput[] = []
      for (const it of dto.items) {
        if (!Number.isFinite(it.quantity) || it.quantity <= 0) throw new AppBadRequestException('Each item needs a quantity greater than 0.', 'PO_ITEM_QTY_INVALID')
        lines.push({
          productId: it.productId,
          variantId: it.variantId ?? null,
          description: it.description?.trim() || (await this.describeProduct(it.productId)),
          quantity: it.quantity,
          unitPrice: it.unitPrice ?? 0,
        })
      }
      if (lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0) <= 0) throw new AppBadRequestException('The order total must be greater than 0.', 'PO_TOTAL_ZERO')
      const id = await this.insert(businessId, {
        rfqId,
        supplierId: supplier.supplierId,
        title: dto.title?.trim() || rfq.title || null,
        messageBody: dto.messageBody?.trim() || rfq.messageBody || null,
        currency: rfq.currency,
        expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : null,
        createdById: context.actorId ?? null,
        lines,
      })
      await this.rfqsService.markConverted(rfqId, businessId)
      this.auditService.log(context, { action: 'CREATE', entityType: 'purchase_order', entityId: id, entityLabel: '', changes: { before: null, after: { fromRfq: rfqId, supplierId: supplier.supplierId } } })
      return this.findById(id, businessId)
    } catch (error) {
      return this.handleServiceError('createFromRfq', error, { businessId, rfqId })
    }
  }

  /** Render the PO to a PDF buffer (download / blob endpoint). */
  async getDocumentPdf(id: string, businessId: string): Promise<Buffer> {
    const po = await this.findById(id, businessId)
    const doc = await this.buildDocument(po, businessId)
    return this.procurementSend.renderPdf(renderPurchaseOrderHtml(doc))
  }

  async send(id: string, businessId: string, dto: SendPurchaseOrderRequest, context: AuditContext): Promise<PurchaseOrder> {
    try {
      const po = await this.findById(id, businessId)
      const doc = await this.buildDocument(po, businessId)
      await this.procurementSend.dispatch({
        businessId,
        html: renderPurchaseOrderHtml(doc),
        message: purchaseOrderMessageText(doc),
        filename: doc.number,
        subject: `${doc.business.name} — ${doc.number}`,
        channels: dto.channels,
        phone: dto.recipient?.phone ?? doc.supplier.phone,
        email: dto.recipient?.email ?? doc.supplier.email,
      })
      await this.poRepo.update(po.id, {
        status: po.status === PurchaseOrderStatus.DRAFT ? PurchaseOrderStatus.SENT : po.status,
        sentAt: new Date(),
      })
      this.auditService.log(context, { action: 'UPDATE', entityType: 'purchase_order', entityId: id, entityLabel: po.number, changes: { before: { status: po.status }, after: { status: 'SENT', channels: dto.channels } } })
      return this.findById(id, businessId)
    } catch (error) {
      return this.handleServiceError('send', error, { businessId, id })
    }
  }

  async cancel(id: string, businessId: string, context: AuditContext): Promise<PurchaseOrder> {
    try {
      const po = await this.findById(id, businessId)
      if (po.status === PurchaseOrderStatus.RECEIVED || po.status === PurchaseOrderStatus.PARTIALLY_RECEIVED) {
        throw new AppBadRequestException('A received purchase order cannot be cancelled.', 'PO_RECEIVED_CANNOT_CANCEL')
      }
      await this.poRepo.update(po.id, { status: PurchaseOrderStatus.CANCELLED })
      this.auditService.log(context, { action: 'UPDATE', entityType: 'purchase_order', entityId: id, entityLabel: po.number, changes: { before: { status: po.status }, after: { status: 'CANCELLED' } } })
      return this.findById(id, businessId)
    } catch (error) {
      return this.handleServiceError('cancel', error, { businessId, id })
    }
  }

  // ---- internals -----------------------------------------------------------

  private async insert(
    businessId: string,
    data: {
      rfqId: string | null
      supplierId: string
      title: string | null
      messageBody: string | null
      currency: string
      expectedDate: Date | null
      createdById: string | null
      lines: PoLineInput[]
    },
  ): Promise<string> {
    const number = await this.nextNumber(businessId)
    const total = data.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0)
    const supplierName = await this.contactName(data.supplierId)
    return this.dataSource.transaction(async (manager) => {
      const po = await manager.getRepository(PurchaseOrder).save(
        manager.getRepository(PurchaseOrder).create({
          businessId,
          number,
          rfqId: data.rfqId,
          supplierId: data.supplierId,
          supplierName,
          title: data.title,
          messageBody: data.messageBody,
          status: PurchaseOrderStatus.DRAFT,
          currency: data.currency,
          expectedDate: data.expectedDate,
          totalAmount: total,
          createdById: data.createdById,
        }),
      )
      for (const l of data.lines) {
        await manager.getRepository(PurchaseOrderItem).save(
          manager.getRepository(PurchaseOrderItem).create({
            purchaseOrderId: po.id,
            productId: l.productId,
            variantId: l.variantId ?? null,
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            receivedQuantity: 0,
          }),
        )
      }
      return po.id
    })
  }

  private async nextNumber(businessId: string): Promise<string> {
    const count = await this.poRepo.count({ where: { businessId } })
    return `PO-${String(count + 1).padStart(5, '0')}`
  }

  private async describeProduct(productId: string): Promise<string> {
    const p = await this.productsRepo.findOne({ where: { id: productId }, select: { id: true, name: true } })
    return p?.name ?? 'Item'
  }

  private async contactName(contactId: string): Promise<string | null> {
    const c = await this.contactsRepo.findOne({ where: { id: contactId }, select: { id: true, name: true } })
    return c?.name ?? null
  }

  private async buildDocument(po: PurchaseOrder, businessId: string): Promise<PurchaseOrderDocument> {
    const biz = await this.businessRepo.findOne({ where: { id: businessId } })
    const supplier = await this.contactsRepo.findOne({ where: { id: po.supplierId, businessId } })
    const items = (po.items ?? []).map((i) => ({
      description: i.description,
      sku: null,
      quantity: Number(i.quantity),
      unitPrice: Number(i.unitPrice),
      lineTotal: Number(i.quantity) * Number(i.unitPrice),
    }))
    const subtotal = items.reduce((s, i) => s + i.lineTotal, 0)
    return {
      number: po.number,
      title: po.title ?? null,
      status: po.status,
      issuedDate: (toIsoString(po.createdAt) ?? '').slice(0, 10),
      expectedDate: po.expectedDate ? (toIsoString(po.expectedDate) ?? '').slice(0, 10) : null,
      currency: po.currency,
      business: { name: biz?.name ?? 'BizTrack', phone: biz?.phone ?? null, email: biz?.email ?? null, address: biz?.address ?? null, logoUrl: biz?.logoUrl ?? null },
      supplier: { name: supplier?.name ?? po.supplierName ?? '', phone: supplier?.phone ?? null, email: null, address: supplier?.address ?? null },
      items,
      subtotal,
      total: Number(po.totalAmount),
      messageBody: po.messageBody ?? null,
    }
  }

  private handleServiceError(operation: string, error: unknown, meta: Record<string, unknown>): never {
    if (error instanceof AppException) throw error
    this.logger.error('PurchaseOrdersService unexpected error', 'PurchaseOrdersService', {
      operation,
      message: error instanceof Error ? error.message : 'Unknown error',
      ...meta,
    })
    throw new AppInternalServerException('Could not complete the request.', 'PURCHASE_ORDER_OPERATION_FAILED')
  }
}
