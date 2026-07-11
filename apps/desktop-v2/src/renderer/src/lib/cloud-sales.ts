import type {
  LocalSale,
  LocalSaleDetail,
  LocalSaleItem,
  LocalSalePayment,
  LocalSalesSummary,
  SalesListQuery,
  SaleInput,
  DocumentSendChannel,
  DocumentRecipient,
  PaginatedResult,
  DailySalesRow,
  CashierPerformanceRow,
  SalesByProductRow,
  SalesByPaymentRow,
  RefundReasonRow,
  RefundCashierRow,
} from '@shared/ipc'
import type { SaleReceipt } from '@biztrack/types'
import { renderSaleReceiptHtml, saleReceiptLabels } from '@biztrack/templates'
import { cget, cgetAll, cpost } from './cloud-http'
import { printHtml, downloadPdfFromHtml } from './cloud-misc'

/** Fetch the structured receipt from the API and render it with the shared template. */
async function fetchReceiptHtml(saleId: string, locale: string): Promise<string | null> {
  try {
    const receipt = await cget<SaleReceipt>(`/sales/${saleId}/receipt`)
    return renderSaleReceiptHtml(receipt, { labels: saleReceiptLabels(locale), locale })
  } catch {
    return null
  }
}

function clean<T extends Record<string, unknown>>(o: T): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null) out[k] = v
  return out
}

/**
 * Cloud (browser) read adapter for sales — list + listAll. The API list DTO already
 * carries `itemCount` (loadRelationCountAndMap) + `receiptNumber`; `syncStatus` is a
 * desktop-only concept → always 'synced' in cloud.
 *
 * GAPS (deferred): `summary` returns zeros — the API has a *daily* summary, not the
 * range `LocalSalesSummary`.
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

interface ApiSale {
  id: string
  saleNumber: string
  receiptNumber?: string | null
  status: LocalSale['status']
  customerId?: string | null
  customerName?: string | null
  customerPhone?: string | null
  subtotal: number
  discountAmount: number
  chargesAmount: number
  totalAmount: number
  amountPaid: number
  creditAmount: number
  changeGiven: number
  currency?: string | null
  paymentMethod?: string | null
  source?: string | null
  notes?: string | null
  soldAt: string
  createdAt: string
  itemCount?: number
}

function toLocalSale(s: ApiSale): LocalSale {
  return {
    id: s.id,
    saleNumber: s.saleNumber,
    receiptNumber: s.receiptNumber ?? s.saleNumber,
    status: s.status,
    customerId: s.customerId ?? null,
    customerName: s.customerName ?? null,
    customerPhone: s.customerPhone ?? null,
    subtotal: s.subtotal,
    discountAmount: s.discountAmount,
    chargesAmount: s.chargesAmount,
    totalAmount: s.totalAmount,
    amountPaid: s.amountPaid,
    creditAmount: s.creditAmount,
    changeGiven: s.changeGiven,
    currency: s.currency ?? 'XAF',
    paymentMethod: s.paymentMethod ?? null,
    source: s.source ?? null,
    notes: s.notes ?? null,
    soldAt: s.soldAt,
    createdAt: s.createdAt,
    itemCount: s.itemCount ?? 0,
    syncStatus: 'synced',
  }
}

// The API ListSalesQueryDto (forbidNonWhitelisted) has no customerId — drop it.
const SALE_QUERY_KEYS = [
  'page',
  'limit',
  'search',
  'sortBy',
  'sortOrder',
  'status',
  'paymentMethod',
  'source',
  'dateFrom',
  'dateTo',
]
function saleQuery(query?: SalesListQuery): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (query) {
    for (const k of SALE_QUERY_KEYS) {
      const v = (query as Record<string, unknown>)[k]
      if (v !== undefined && v !== null && v !== '') out[k] = v
    }
  }
  return out
}

interface ApiSaleItem {
  id: string
  productId: string
  productName: string
  variantId?: string | null
  variantName?: string | null
  serialNumber?: string | null
  quantity: number
  unitPrice: number
  discountAmount: number
  lineTotal: number
}
interface ApiSalePayment {
  id: string
  method: LocalSalePayment['method']
  amount: number
  mobileMoneyReference?: string | null
}
type ApiSaleDetail = ApiSale & { items?: ApiSaleItem[]; payments?: ApiSalePayment[] }

function toLocalSaleItem(i: ApiSaleItem): LocalSaleItem {
  return {
    id: i.id,
    productId: i.productId,
    productName: i.productName,
    variantId: i.variantId ?? null,
    variantName: i.variantName ?? null,
    serialNumber: i.serialNumber ?? null,
    quantity: i.quantity,
    unitPrice: i.unitPrice,
    discountAmount: i.discountAmount,
    lineTotal: i.lineTotal,
  }
}
function toLocalSalePayment(p: ApiSalePayment): LocalSalePayment {
  return {
    id: p.id,
    method: p.method,
    amount: p.amount,
    mobileMoneyReference: p.mobileMoneyReference ?? null,
  }
}

export const cloudSales = {
  list: async (query?: SalesListQuery): Promise<PaginatedResult<LocalSale>> => {
    const res = await cget<PaginatedResult<ApiSale>>(`/sales${qs(saleQuery(query))}`)
    return { ...res, data: res.data.map(toLocalSale) }
  },
  listAll: async (query?: SalesListQuery): Promise<LocalSale[]> =>
    (await cgetAll<ApiSale>(`/sales${qs(saleQuery(query))}`)).map(toLocalSale),
  summary: (query?: SalesListQuery): Promise<LocalSalesSummary> =>
    cget<LocalSalesSummary>(`/sales/summary${qs(saleQuery(query))}`),
  dailySeries: (query?: SalesListQuery): Promise<DailySalesRow[]> =>
    cget<DailySalesRow[]>(`/sales/summary/daily-series${qs(saleQuery(query))}`),
  cashierRoster: (query?: SalesListQuery): Promise<CashierPerformanceRow[]> =>
    cget<CashierPerformanceRow[]>(`/sales/cashier-roster${qs(saleQuery(query))}`),
  byProduct: (query?: SalesListQuery): Promise<SalesByProductRow[]> =>
    cget<SalesByProductRow[]>(`/sales/by-product${qs(saleQuery(query))}`),
  byPaymentMethod: (query?: SalesListQuery): Promise<SalesByPaymentRow[]> =>
    cget<SalesByPaymentRow[]>(`/sales/by-payment-method${qs(saleQuery(query))}`),
  refunds: (
    query?: SalesListQuery,
  ): Promise<{ byReason: RefundReasonRow[]; byCashier: RefundCashierRow[]; grossSales: number }> =>
    cget<{ byReason: RefundReasonRow[]; byCashier: RefundCashierRow[]; grossSales: number }>(
      `/sales/refunds${qs(saleQuery(query))}`,
    ),
  grossProfit: (query?: SalesListQuery): Promise<{ revenue: number; cogs: number }> =>
    cget<{ revenue: number; cogs: number }>(`/sales/gross-profit${qs(saleQuery(query))}`),
  // The API now mirrors the desktop sale model: serialised lines (serialUnitIds[]),
  // SAVINGS/deposit payments (savingsAccountId), and per-line charges/discounts. The
  // backend derives the sale totals from the lines and persists the breakdown.
  create: async (input: SaleInput): Promise<LocalSaleDetail> => {
    const charges = (input.charges ?? []).map((c) =>
      clean({
        chargeTypeId: c.chargeTypeId,
        name: c.name,
        rateType: c.rateType,
        rateValue: c.rateValue,
        amount: c.amount,
      }),
    )
    const discounts = (input.discounts ?? []).map((d) =>
      clean({
        description: d.description,
        discountType: d.discountType,
        rate: d.rate,
        amount: d.amount,
      }),
    )
    const body = clean({
      clientId: input.clientId,
      soldAt: input.soldAt ?? new Date().toISOString(),
      customerId: input.customerId,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      notes: input.notes,
      charges: charges.length ? charges : undefined,
      discounts: discounts.length ? discounts : undefined,
      payments: input.payments.map((p) =>
        clean({
          method: p.method,
          amount: p.amount,
          mobileMoneyReference: p.mobileMoneyReference,
          savingsAccountId: p.savingsAccountId,
        }),
      ),
      items: input.items.map((i) =>
        clean({
          productId: i.productId,
          variantId: i.variantId,
          variantName: i.variantName,
          serialUnitIds: i.serialUnitIds?.length ? i.serialUnitIds : undefined,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          discountAmount: i.discountAmount,
          costPrice: i.costPrice,
        }),
      ),
    })
    const sale = await cpost<ApiSaleDetail>('/sales', body)
    return {
      ...toLocalSale(sale),
      items: (sale.items ?? []).map(toLocalSaleItem),
      payments: (sale.payments ?? []).map(toLocalSalePayment),
    }
  },
  get: async (id: string): Promise<LocalSaleDetail | null> => {
    try {
      const s = await cget<ApiSaleDetail>(`/sales/${id}`)
      return {
        ...toLocalSale(s),
        items: (s.items ?? []).map(toLocalSaleItem),
        payments: (s.payments ?? []).map(toLocalSalePayment),
      }
    } catch {
      return null
    }
  },
  // Render the receipt server-side payload + dispatch via the API (email/WhatsApp).
  sendReceipt: async (
    saleId: string,
    channel: DocumentSendChannel,
    locale: string,
    opts?: { recipient?: DocumentRecipient; online?: boolean },
  ): Promise<void> => {
    await cpost<{ pdfUrl: string }>(
      `/sales/${saleId}/send`,
      clean({ channels: [channel], locale, recipient: opts?.recipient }),
    )
  },
  // Browser: render the receipt HTML and open the print dialog (→ printer or save-as-PDF).
  printReceipt: async (
    saleId: string,
    locale: string,
  ): Promise<{ printed: boolean; pdfPath?: string }> => {
    const html = await fetchReceiptHtml(saleId, locale)
    if (!html) return { printed: false }
    printHtml(html)
    return { printed: true }
  },
  // Render the receipt HTML, then compile it to a real PDF on the server and download it.
  downloadReceipt: async (
    saleId: string,
    locale: string,
  ): Promise<{ saved: boolean; path?: string }> => {
    const html = await fetchReceiptHtml(saleId, locale)
    if (!html) return { saved: false }
    await downloadPdfFromHtml(html, `receipt-${saleId}`)
    return { saved: true }
  },
  receiptHtml: (saleId: string, locale: string): Promise<string | null> =>
    fetchReceiptHtml(saleId, locale),
}
