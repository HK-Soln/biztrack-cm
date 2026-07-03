import type {
  LocalInventoryItem,
  InventoryStats,
  LocalReorderSuggestion,
  LocalStockMovement,
  InventoryListQuery,
  MovementsQuery,
  AdjustStockInput,
  ThresholdInput,
  RestockInput,
  PaginatedResult,
  InventoryTurnoverRow,
  DeadStockRow,
  SupplierPriceRow,
} from '@shared/ipc'
import { cget, cgetAll, cpost, cpatch } from './cloud-http'

function clean<T extends Record<string, unknown>>(o: T): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null) out[k] = v
  return out
}

/**
 * Cloud (browser) read adapter for inventory. Maps the API list/alert/movement DTOs to
 * the desktop `Local*` shapes. `stockStatus` is derived from `isLowStock` + quantity.
 *
 * GAPS (defaulted, flagged): the list DTO doesn't carry per-product `currency` or
 * `stockValueCost` (cost×stock) → defaulted; there's no `GET /inventory/stats`, so
 * `stats()` returns zeros.
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

function stockStatus(quantity: number, isLowStock: boolean): LocalInventoryItem['stockStatus'] {
  if (quantity <= 0) return 'out'
  if (isLowStock) return 'low'
  return 'in'
}

interface ApiInventoryItem {
  productId: string
  productName?: string | null
  sku?: string | null
  primaryImageUrl?: string | null
  categoryName?: string | null
  unitAbbreviation?: string | null
  quantity: number
  lowStockThreshold?: number | null
  reorderPoint?: number | null
  isLowStock: boolean
  lastRestockAt?: string | null
}

function toLocalInventoryItem(i: ApiInventoryItem): LocalInventoryItem {
  return {
    productId: i.productId,
    name: i.productName ?? '',
    sku: i.sku ?? null,
    imageUrl: i.primaryImageUrl ?? null,
    categoryName: i.categoryName ?? null,
    unitAbbr: i.unitAbbreviation ?? null,
    currency: 'XAF', // per-product currency not exposed by the inventory list DTO yet
    currentStock: i.quantity,
    lowStockThreshold: i.lowStockThreshold ?? null,
    reorderPoint: i.reorderPoint ?? null,
    stockStatus: stockStatus(i.quantity, i.isLowStock),
    stockValueCost: 0, // cost×stock not exposed by the inventory list DTO yet
    lastRestockAt: i.lastRestockAt ?? null,
  }
}

interface ApiInventoryAlert {
  productId: string
  productName?: string | null
  sku?: string | null
  currentQuantity: number
  lowStockThreshold?: number | null
  reorderPoint?: number | null
  shortfall: number
}

function toLocalReorderSuggestion(a: ApiInventoryAlert): LocalReorderSuggestion {
  return {
    productId: a.productId,
    name: a.productName ?? '',
    sku: a.sku ?? null,
    currentStock: a.currentQuantity,
    target: a.reorderPoint ?? a.lowStockThreshold ?? 0,
    suggestedQty: a.shortfall,
    unitCost: null,
    currency: 'XAF',
  }
}

interface ApiMovement {
  id: string
  productId?: string
  productName?: string | null
  type: LocalStockMovement['type']
  quantityChange: number
  quantityBefore: number
  quantityAfter: number
  referenceType?: string | null
  referenceId?: string | null
  notes?: string | null
  performedBy?: { name?: string | null } | null
  createdAt: string
}

function toLocalStockMovement(m: ApiMovement): LocalStockMovement {
  return {
    id: m.id,
    productId: m.productId,
    productName: m.productName ?? null,
    type: m.type,
    quantityChange: m.quantityChange,
    quantityBefore: m.quantityBefore,
    quantityAfter: m.quantityAfter,
    referenceType: m.referenceType ?? null,
    referenceId: m.referenceId ?? null,
    notes: m.notes ?? null,
    performedByName: m.performedBy?.name ?? null,
    createdAt: m.createdAt,
  }
}

export const cloudInventory = {
  list: async (query?: InventoryListQuery): Promise<PaginatedResult<LocalInventoryItem>> => {
    const res = await cget<PaginatedResult<ApiInventoryItem>>(`/inventory${qs(query as Record<string, unknown>)}`)
    return { ...res, data: res.data.map(toLocalInventoryItem) }
  },
  stats: (): Promise<InventoryStats> => cget<InventoryStats>('/inventory/stats'),
  reorderSuggestions: async (): Promise<LocalReorderSuggestion[]> =>
    (await cgetAll<ApiInventoryAlert>('/inventory/alerts')).map(toLocalReorderSuggestion),
  listMovements: async (productId: string, query?: MovementsQuery): Promise<PaginatedResult<LocalStockMovement>> => {
    const res = await cget<PaginatedResult<ApiMovement>>(
      `/inventory/${productId}/movements${qs(query as Record<string, unknown>)}`,
    )
    return { ...res, data: res.data.map(toLocalStockMovement) }
  },
  listAllMovements: async (query?: MovementsQuery): Promise<PaginatedResult<LocalStockMovement>> => {
    const res = await cget<PaginatedResult<ApiMovement>>(`/inventory/movements${qs(query as Record<string, unknown>)}`)
    return { ...res, data: res.data.map(toLocalStockMovement) }
  },
  turnover: (query?: MovementsQuery): Promise<InventoryTurnoverRow[]> =>
    cget<InventoryTurnoverRow[]>(`/inventory/turnover${qs(query as Record<string, unknown>)}`),
  deadStock: (): Promise<{ rows: DeadStockRow[]; stockCostTotal: number }> =>
    cget<{ rows: DeadStockRow[]; stockCostTotal: number }>('/inventory/dead-stock'),
  supplierPriceTrend: (): Promise<SupplierPriceRow[]> => cget<SupplierPriceRow[]>('/inventory/supplier-price-trend'),
  // The backend derives the settlement from items/charges/discounts/payments and fulfils
  // the PO (received qty + status) when purchaseOrderId is set.
  restock: async (input: RestockInput): Promise<void> => {
    await cpost<unknown>(
      '/inventory/restock',
      clean({
        referenceNumber: input.reference,
        purchaseOrderId: input.purchaseOrderId,
        supplierId: input.supplierId,
        amountPaid: input.amountPaid,
        notes: input.notes,
        invoiceNumber: input.invoiceNumber,
        invoiceDate: input.invoiceDate,
        invoiceFileUrl: input.invoiceFileUrl,
        payments: input.payments?.length
          ? input.payments.map((p) =>
              clean({ method: p.method, amount: p.amount, mobileMoneyReference: p.mobileMoneyReference }),
            )
          : undefined,
        charges: input.charges?.length
          ? input.charges.map((c) =>
              clean({
                id: c.id,
                chargeTypeId: c.chargeTypeId,
                name: c.name,
                rateType: c.rateType,
                rateValue: c.rateValue,
                amount: c.amount,
              }),
            )
          : undefined,
        discounts: input.discounts?.length
          ? input.discounts.map((d) =>
              clean({ id: d.id, description: d.description, discountType: d.discountType, rate: d.rate, amount: d.amount }),
            )
          : undefined,
        items: input.items.map((i) =>
          clean({
            productId: i.productId,
            variantId: i.variantId,
            quantity: i.quantity,
            unitCost: i.unitCost,
            serialNumbers: i.serialNumbers?.length ? i.serialNumbers : undefined,
          }),
        ),
      }),
    )
  },
  adjust: async (productId: string, input: AdjustStockInput): Promise<void> => {
    await cpost<unknown>(`/inventory/${productId}/adjust`, clean({ ...input }))
  },
  setThreshold: async (productId: string, input: ThresholdInput): Promise<void> => {
    await cpatch<unknown>(`/inventory/${productId}/threshold`, {
      lowStockThreshold: input.lowStockThreshold,
      reorderPoint: input.reorderPoint,
    })
  },
}
