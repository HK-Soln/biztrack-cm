import type { ListQuery, IsoDateString, PaginatedResult } from './http.types'
import type { DocumentBusinessInfo, DocumentParty } from './document.types'

export enum PurchaseOrderStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  CONFIRMED = 'CONFIRMED',
  PARTIALLY_RECEIVED = 'PARTIALLY_RECEIVED',
  RECEIVED = 'RECEIVED',
  CANCELLED = 'CANCELLED',
}

// --- entity / API contract ---------------------------------------------------
export interface PurchaseOrderItem {
  id: string
  purchaseOrderId: string
  productId: string
  variantId?: string | null
  description: string
  quantity: number
  unitPrice: number
  receivedQuantity: number
}

export interface PurchaseOrder {
  id: string
  businessId: string
  number: string
  rfqId?: string | null
  supplierId: string
  supplierName?: string | null
  title?: string | null
  messageBody?: string | null
  status: PurchaseOrderStatus
  currency: string
  expectedDate?: string | null
  totalAmount: number
  sentAt?: IsoDateString | null
  createdById: string
  createdAt: IsoDateString
  updatedAt: IsoDateString
  items?: PurchaseOrderItem[]
}

export interface PurchaseOrderListItem extends PurchaseOrder {
  itemCount: number
  receivedRatio: number
}

export interface PurchaseOrderListResult extends PaginatedResult<PurchaseOrderListItem> {}

export interface PurchaseOrdersQuery extends ListQuery {
  status?: PurchaseOrderStatus
  supplierId?: string
  rfqId?: string
}

export interface CreatePurchaseOrderItemRequest {
  productId: string
  variantId?: string | null
  description?: string
  quantity: number
  unitPrice: number
}

export interface CreatePurchaseOrderRequest {
  supplierId: string
  rfqId?: string | null
  title?: string
  messageBody?: string
  currency?: string
  expectedDate?: string
  items: CreatePurchaseOrderItemRequest[]
}

export interface UpdatePurchaseOrderRequest extends Partial<Omit<CreatePurchaseOrderRequest, 'items'>> {
  items?: CreatePurchaseOrderItemRequest[]
}

/** Channels a PO can be sent through. Desktop opens the share; API sends. */
export type PurchaseOrderSendChannel = 'email' | 'whatsapp'

export interface SendPurchaseOrderRequest {
  channels: PurchaseOrderSendChannel[]
  /** Override recipient when the supplier contact has no stored email/phone. */
  recipient?: import('./document.types').DocumentRecipient
}

// --- document view model (consumed by @biztrack/templates) -------------------
export interface PurchaseOrderDocumentItem {
  description: string
  sku?: string | null
  quantity: number
  unitPrice: number
  lineTotal: number
}

export interface PurchaseOrderDocument {
  number: string
  title?: string | null
  status: PurchaseOrderStatus
  issuedDate: string
  expectedDate?: string | null
  currency: string
  locale?: string
  business: DocumentBusinessInfo
  supplier: DocumentParty
  items: PurchaseOrderDocumentItem[]
  subtotal: number
  total: number
  messageBody?: string | null
  notes?: string | null
}
