import type { ListQuery, IsoDateString, PaginatedResult } from './http.types'
import type { DocumentBusinessInfo, DocumentParty } from './document.types'

export enum RfqStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  QUOTED = 'QUOTED',
  CONVERTED = 'CONVERTED',
  CLOSED = 'CLOSED',
  CANCELLED = 'CANCELLED',
}

export enum RfqSupplierStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  QUOTED = 'QUOTED',
  DECLINED = 'DECLINED',
}

// --- entity / API contract ---------------------------------------------------
export interface RfqItem {
  id: string
  rfqId: string
  productId: string
  variantId?: string | null
  description: string
  quantity: number
}

export interface RfqSupplier {
  id: string
  rfqId: string
  supplierId: string
  supplierName?: string | null
  status: RfqSupplierStatus
  quotedTotal?: number | null
  quoteNotes?: string | null
  respondedAt?: IsoDateString | null
}

export interface Rfq {
  id: string
  businessId: string
  number: string
  title?: string | null
  messageBody?: string | null
  status: RfqStatus
  currency: string
  createdById: string
  createdAt: IsoDateString
  updatedAt: IsoDateString
  items?: RfqItem[]
  suppliers?: RfqSupplier[]
}

export interface RfqListItem extends Rfq {
  itemCount: number
  supplierCount: number
  quoteCount: number
}

export interface RfqListResult extends PaginatedResult<RfqListItem> {}

export interface RfqsQuery extends ListQuery {
  status?: RfqStatus
  supplierId?: string
}

export interface CreateRfqItemRequest {
  productId: string
  variantId?: string | null
  description?: string
  quantity: number
}

export interface CreateRfqRequest {
  title?: string
  messageBody?: string
  currency?: string
  supplierIds: string[]
  items: CreateRfqItemRequest[]
}

export interface UpdateRfqRequest extends Partial<Omit<CreateRfqRequest, 'items' | 'supplierIds'>> {
  items?: CreateRfqItemRequest[]
  supplierIds?: string[]
}

export interface RecordRfqQuoteRequest {
  rfqSupplierId: string
  quotedTotal: number
  quoteNotes?: string
}

export interface ConvertRfqToPoRequest {
  rfqSupplierId: string
  /** Per-item unit prices for the PO; keyed by rfq item id. */
  unitPrices: Record<string, number>
  expectedDate?: string
}

/** Channels an RFQ can be sent through. */
export type RfqSendChannel = 'email' | 'whatsapp'

export interface SendRfqRequest {
  channels: RfqSendChannel[]
  /** Optional subset of supplier ids to (re)send to; defaults to all pending. */
  supplierIds?: string[]
}

// --- document view model (consumed by @biztrack/templates) -------------------
export interface RfqDocumentItem {
  description: string
  sku?: string | null
  quantity: number
}

export interface RfqDocument {
  number: string
  title?: string | null
  issuedDate: string
  responseDeadline?: string | null
  currency: string
  locale?: string
  business: DocumentBusinessInfo
  supplier: DocumentParty
  items: RfqDocumentItem[]
  messageBody?: string | null
}
