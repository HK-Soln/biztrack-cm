import type {
  RfqsQuery,
  CreateRfqRequest,
  RecordRfqQuoteRequest,
  RfqDocument,
  RfqSendChannel,
  LocalRfqDetail,
  LocalRfqListItem,
  PurchaseOrdersQuery,
  CreatePurchaseOrderRequest,
  ConvertRfqToPoRequest,
  PurchaseOrderDocument,
  PurchaseOrderSendChannel,
  LocalPurchaseOrderDetail,
  LocalPurchaseOrderListItem,
  PaginatedResult,
} from '@shared/ipc'
import { cget, cpost } from './cloud-http'
import { cloudBusiness } from './cloud-data'
import { cloudContacts } from './cloud-contacts'

/**
 * Cloud (browser) adapters for the procurement chain (RFQs + purchase orders). The API
 * list/detail DTOs are supersets of the desktop `Local*` shapes (they only add
 * businessId/createdById), so reads/writes pass through. `buildDocument` is assembled
 * client-side — the API's `/document` route returns a rendered PDF, not the JSON the
 * renderer feeds into its HTML preview, so we build the document object from the detail
 * + business profile + supplier contact (mirroring the desktop builder).
 */

function qs(query?: Record<string, unknown>): string {
  if (!query) return ''
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}

// ---- RFQs -----------------------------------------------------------------
export const cloudRfqs = {
  list: (query?: RfqsQuery): Promise<PaginatedResult<LocalRfqListItem>> =>
    cget<PaginatedResult<LocalRfqListItem>>(`/rfqs${qs(query as Record<string, unknown>)}`),
  get: async (id: string): Promise<LocalRfqDetail | null> => {
    try {
      return await cget<LocalRfqDetail>(`/rfqs/${id}`)
    } catch {
      return null
    }
  },
  create: (input: CreateRfqRequest): Promise<LocalRfqDetail> => cpost<LocalRfqDetail>('/rfqs', input),
  recordQuote: (rfqId: string, input: RecordRfqQuoteRequest): Promise<LocalRfqDetail> =>
    cpost<LocalRfqDetail>(`/rfqs/${rfqId}/quotes`, input),
  send: (rfqId: string, supplierId: string, channel: RfqSendChannel): Promise<LocalRfqDetail> =>
    cpost<LocalRfqDetail>(`/rfqs/${rfqId}/send`, { channels: [channel], supplierIds: [supplierId] }),
  buildDocument: async (rfqId: string, supplierId: string): Promise<RfqDocument> => {
    const [rfq, biz, supplier] = await Promise.all([
      cget<LocalRfqDetail>(`/rfqs/${rfqId}`),
      cloudBusiness.getProfile(),
      cloudContacts.get(supplierId),
    ])
    return {
      number: rfq.number,
      title: rfq.title,
      issuedDate: new Date(rfq.createdAt).toLocaleDateString(),
      currency: rfq.currency,
      business: {
        name: biz?.name ?? 'BizTrack',
        phone: biz?.phone ?? null,
        email: biz?.email ?? null,
        address: biz?.address ?? null,
        logoUrl: biz?.logoUrl ?? null,
      },
      supplier: {
        name: supplier?.name ?? '',
        phone: supplier?.phone ?? null,
        email: supplier?.email ?? null,
        address: supplier?.address ?? null,
      },
      items: rfq.items.map((i) => ({ description: i.description, sku: null, quantity: i.quantity })),
      messageBody: rfq.messageBody,
    }
  },
}

// ---- Purchase orders ------------------------------------------------------
export const cloudPurchaseOrders = {
  list: (query?: PurchaseOrdersQuery): Promise<PaginatedResult<LocalPurchaseOrderListItem>> =>
    cget<PaginatedResult<LocalPurchaseOrderListItem>>(`/purchase-orders${qs(query as Record<string, unknown>)}`),
  get: async (id: string): Promise<LocalPurchaseOrderDetail | null> => {
    try {
      return await cget<LocalPurchaseOrderDetail>(`/purchase-orders/${id}`)
    } catch {
      return null
    }
  },
  create: (input: CreatePurchaseOrderRequest): Promise<LocalPurchaseOrderDetail> =>
    cpost<LocalPurchaseOrderDetail>('/purchase-orders', input),
  createFromRfq: (rfqId: string, input: ConvertRfqToPoRequest): Promise<LocalPurchaseOrderDetail> =>
    cpost<LocalPurchaseOrderDetail>(`/purchase-orders/from-rfq/${rfqId}`, input),
  send: (poId: string, channel: PurchaseOrderSendChannel): Promise<LocalPurchaseOrderDetail> =>
    cpost<LocalPurchaseOrderDetail>(`/purchase-orders/${poId}/send`, { channels: [channel] }),
  cancel: (poId: string): Promise<LocalPurchaseOrderDetail> =>
    cpost<LocalPurchaseOrderDetail>(`/purchase-orders/${poId}/cancel`, {}),
  buildDocument: async (poId: string): Promise<PurchaseOrderDocument> => {
    const [po, biz] = await Promise.all([
      cget<LocalPurchaseOrderDetail>(`/purchase-orders/${poId}`),
      cloudBusiness.getProfile(),
    ])
    const supplierContact = po.supplierId ? await cloudContacts.get(po.supplierId).catch(() => null) : null
    const items = po.items.map((i) => ({
      description: i.description,
      sku: null,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      lineTotal: i.quantity * i.unitPrice,
    }))
    const subtotal = items.reduce((s, i) => s + i.lineTotal, 0)
    return {
      number: po.number,
      title: po.title,
      status: po.status,
      issuedDate: new Date(po.createdAt).toLocaleDateString(),
      expectedDate: po.expectedDate ?? null,
      currency: po.currency,
      business: {
        name: biz?.name ?? 'BizTrack',
        phone: biz?.phone ?? null,
        email: biz?.email ?? null,
        address: biz?.address ?? null,
        logoUrl: biz?.logoUrl ?? null,
      },
      supplier: {
        name: supplierContact?.name ?? po.supplierName ?? '',
        phone: supplierContact?.phone ?? null,
        email: supplierContact?.email ?? null,
        address: supplierContact?.address ?? null,
      },
      items,
      subtotal,
      total: subtotal,
      messageBody: po.messageBody,
      notes: null,
    }
  },
}
