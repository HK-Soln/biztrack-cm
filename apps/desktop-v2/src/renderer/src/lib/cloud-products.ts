import type {
  LocalProduct,
  ProductListQuery,
  ProductStats,
  PaginatedResult,
  LocalVariant,
  LocalSerialUnit,
  LocalProductImage,
  LocalStockMovement,
  ProductInput,
  ProductImageInput,
  VariantInput,
  SerialUnitInput,
  ScanHit,
} from '@shared/ipc'
import type { ProductVariant } from '@biztrack/types'
import { SerialUnitStatus } from '@biztrack/types'

/** The API's /products/scan response (mirrors the shared ProductScanResult). */
type ApiScanResult =
  | { kind: 'product'; product: ApiProduct }
  | { kind: 'variant'; product: ApiProduct; variant: ProductVariant }
  | { kind: 'serial'; product: ApiProduct; serial: ApiSerialUnit }
import { cget, cgetAll, cpost, cpatch, cdelete } from './cloud-http'

/** Drop null/undefined so a payload satisfies the API's non-null optional DTO fields. */
function clean<T extends Record<string, unknown>>(o: T): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null) out[k] = v
  return out
}

// AddProductVariantDto accepts these (not lowStockThreshold).
function variantCreatePayload(v: VariantInput): Record<string, unknown> {
  return clean({
    name: v.name,
    priceOverride: v.priceOverride,
    costPriceOverride: v.costPriceOverride,
    sku: v.sku,
    isActive: v.isActive,
    openingStock: v.openingStock,
    options: v.options,
  })
}
function serialPayload(units: SerialUnitInput[]): Array<Record<string, unknown>> {
  return units.map((u) =>
    clean({ serialNumber: u.serialNumber, serialType: u.serialType, variantId: u.variantId }),
  )
}

/**
 * Cloud (browser) read adapter for products — list + get. The API `ProductResponseDto`
 * covers everything the Products LIST displays (name/sku/category/price/stock/status);
 * fields it doesn't expose yet (variant-averaged effective prices) are defaulted here —
 * they're used on detail/form screens, not the list. Stats, all writes, the detail
 * sub-resources (images/variants/serials/movements), and `resolveScan` are wired to
 * their API endpoints.
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

interface ApiProduct {
  id: string
  name: string
  slug?: string | null
  description?: string | null
  sku?: string | null
  barcode?: string | null
  sellingPrice: number
  effectiveSellingPrice?: number | null
  costPrice?: number | null
  currency: string
  taxRate: number
  productType: LocalProduct['productType']
  isService: boolean
  trackInventory: boolean
  categoryId?: string | null
  imageUrl?: string | null
  primaryImageUrl?: string | null
  isActive: boolean
  isSerialized?: boolean
  serialType?: LocalProduct['serialType']
  warrantyMonths?: number | null
  lowStockThreshold?: number | null
  reorderPoint?: number | null
  currentStock?: number | null
  category?: { id?: string; name?: string } | null
  unitOfMeasure?: { id?: string; abbreviation?: string | null } | null
  brandId?: string | null
  modelId?: string | null
  isFeatured?: boolean
  isPublishedOnline?: boolean
  onlineDescription?: string | null
  onlineStockReserve?: number
  metaTitle?: string | null
  metaDescription?: string | null
}

function toLocalProduct(p: ApiProduct): LocalProduct {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug ?? null,
    description: p.description ?? null,
    sku: p.sku ?? null,
    barcode: p.barcode ?? null,
    sellingPrice: p.sellingPrice,
    costPrice: p.costPrice ?? null,
    effectiveSellingPrice: p.effectiveSellingPrice ?? p.sellingPrice,
    effectiveCostPrice: p.costPrice ?? null,
    currency: p.currency,
    taxRate: p.taxRate,
    productType: p.productType,
    isService: p.isService,
    trackInventory: p.trackInventory,
    categoryId: p.categoryId ?? null,
    brandId: p.brandId ?? null,
    modelId: p.modelId ?? null,
    unitOfMeasureId: p.unitOfMeasure?.id ?? null,
    imageUrl: p.imageUrl ?? p.primaryImageUrl ?? null,
    isActive: p.isActive,
    isFeatured: p.isFeatured ?? false,
    isPublishedOnline: p.isPublishedOnline ?? false,
    onlineDescription: p.onlineDescription ?? null,
    onlineStockReserve: p.onlineStockReserve ?? 0,
    metaTitle: p.metaTitle ?? null,
    metaDescription: p.metaDescription ?? null,
    isSerialized: p.isSerialized ?? false,
    serialType: p.serialType ?? null,
    warrantyMonths: p.warrantyMonths ?? null,
    lowStockThreshold: p.lowStockThreshold ?? null,
    reorderPoint: p.reorderPoint ?? null,
    currentStock: p.currentStock ?? 0,
    categoryName: p.category?.name ?? null,
    brandName: null,
    unitAbbr: p.unitOfMeasure?.abbreviation ?? null,
  }
}

// Keys the API products list (ListProductsQueryDto + forbidNonWhitelisted) accepts.
// `stockStatus: 'all'` is dropped below (the API only knows in/low/out).
const PRODUCT_QUERY_KEYS = [
  'page',
  'limit',
  'search',
  'sortBy',
  'sortOrder',
  'categoryId',
  'isActive',
  'isService',
  'trackInventory',
  'brandId',
  'stockStatus',
]
function productQuery(query?: ProductListQuery): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (query) {
    for (const k of PRODUCT_QUERY_KEYS) {
      const v = (query as Record<string, unknown>)[k]
      if (v !== undefined && v !== null && v !== '' && v !== 'all') out[k] = v
    }
  }
  return out
}

function toLocalVariant(v: ProductVariant): LocalVariant {
  return {
    id: v.id,
    name: v.name,
    priceOverride: v.priceOverride ?? null,
    costPriceOverride: v.costPriceOverride ?? null,
    sku: v.sku ?? null,
    isActive: v.isActive,
    sortOrder: v.sortOrder,
    stockQuantity: v.currentStock ?? 0,
    lowStockThreshold: v.lowStockThreshold ?? null,
    options: (v.options ?? []).map((o) => ({
      attributeGroupId: o.attributeGroupId,
      attributeOptionId: o.attributeOptionId,
    })),
  }
}

interface ApiSerialUnit {
  id: string
  productId: string
  variantId?: string | null
  serialNumber: string
  serialType: LocalSerialUnit['serialType']
  status: string
}
function toLocalSerialUnit(s: ApiSerialUnit): LocalSerialUnit {
  return {
    id: s.id,
    productId: s.productId,
    variantId: s.variantId ?? null,
    serialNumber: s.serialNumber,
    serialType: s.serialType,
    status: s.status,
  }
}

interface ApiProductImage {
  id: string
  productId: string
  url: string
  altText?: string | null
  sortOrder: number
}
function toLocalProductImage(i: ApiProductImage): LocalProductImage {
  return {
    id: i.id,
    productId: i.productId,
    url: i.url,
    altText: i.altText ?? null,
    sortOrder: i.sortOrder,
  }
}

interface ApiMovement {
  id: string
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

export const cloudProducts = {
  list: async (query?: ProductListQuery): Promise<PaginatedResult<LocalProduct>> => {
    const res = await cget<PaginatedResult<ApiProduct>>(`/products${qs(productQuery(query))}`)
    return { ...res, data: res.data.map(toLocalProduct) }
  },
  stats: (): Promise<ProductStats> => cget<ProductStats>('/products/stats'),
  get: async (id: string): Promise<LocalProduct | null> => {
    try {
      return toLocalProduct(await cget<ApiProduct>(`/products/${id}`))
    } catch {
      return null
    }
  },
  remove: (id: string): Promise<void> => cdelete<void>(`/products/${id}`),
  create: async (input: ProductInput): Promise<LocalProduct> =>
    toLocalProduct(
      await cpost<ApiProduct>('/products', clean(input as unknown as Record<string, unknown>)),
    ),
  update: async (id: string, input: ProductInput): Promise<LocalProduct> =>
    toLocalProduct(
      await cpatch<ApiProduct>(
        `/products/${id}`,
        clean(input as unknown as Record<string, unknown>),
      ),
    ),
  // GET /products/:id/images is paginated ({ data, total, … }) — cgetAll flattens the pages
  // into a plain array (never treat the paginated envelope as the array itself).
  listImages: async (productId: string): Promise<LocalProductImage[]> =>
    (await cgetAll<ApiProductImage>(`/products/${productId}/images`)).map(toLocalProductImage),
  // No bulk endpoint — reconcile the desired gallery against the current rows (images are
  // stateless url+alt+order, so this is safe).
  setImages: async (productId: string, images: ProductImageInput[]): Promise<void> => {
    const current = await cgetAll<ApiProductImage>(`/products/${productId}/images`)
    const desiredIds = new Set(images.map((i) => i.id).filter(Boolean))
    for (const c of current) {
      if (!desiredIds.has(c.id)) await cdelete<unknown>(`/products/${productId}/images/${c.id}`)
    }
    let sortOrder = 0
    for (const img of images) {
      const body = clean({ url: img.url, altText: img.altText, sortOrder: sortOrder++ })
      if (img.id && current.some((c) => c.id === img.id))
        await cpatch<unknown>(`/products/${productId}/images/${img.id}`, body)
      else await cpost<unknown>(`/products/${productId}/images`, body)
    }
  },
  listVariants: async (productId: string): Promise<LocalVariant[]> =>
    (await cget<ProductVariant[]>(`/products/${productId}/variants`)).map(toLocalVariant),
  // Only called at product creation (no pre-existing variants) — add each.
  setVariants: async (productId: string, variants: VariantInput[]): Promise<void> => {
    for (const v of variants)
      await cpost<unknown>(`/products/${productId}/variants`, variantCreatePayload(v))
  },
  addVariant: async (productId: string, input: VariantInput): Promise<LocalVariant> =>
    toLocalVariant(
      await cpost<ProductVariant>(`/products/${productId}/variants`, variantCreatePayload(input)),
    ),
  updateVariant: async (
    productId: string,
    variantId: string,
    input: VariantInput,
  ): Promise<LocalVariant> =>
    toLocalVariant(
      await cpatch<ProductVariant>(
        `/products/${productId}/variants/${variantId}`,
        clean({
          name: input.name,
          priceOverride: input.priceOverride,
          costPriceOverride: input.costPriceOverride,
          sku: input.sku,
          isActive: input.isActive,
        }),
      ),
    ),
  removeVariant: (productId: string, variantId: string, reason: string): Promise<void> =>
    cdelete<void>(`/products/${productId}/variants/${variantId}`, { reason }),
  listSerialUnits: async (productId: string): Promise<LocalSerialUnit[]> =>
    (await cgetAll<ApiSerialUnit>(`/products/${productId}/serial-units`)).map(toLocalSerialUnit),
  listInStockSerials: async (
    productId: string,
    variantId?: string | null,
    search?: string,
  ): Promise<LocalSerialUnit[]> => {
    const params = new URLSearchParams({ status: SerialUnitStatus.IN_STOCK })
    if (variantId) params.set('variantId', variantId)
    const units = (
      await cgetAll<ApiSerialUnit>(`/products/${productId}/serial-units?${params.toString()}`)
    ).map(toLocalSerialUnit)
    const q = search?.trim().toLowerCase()
    return q ? units.filter((u) => u.serialNumber.toLowerCase().includes(q)) : units
  },
  resolveScan: async (code: string): Promise<ScanHit | null> => {
    const c = code.trim()
    if (!c) return null
    try {
      const r = await cget<ApiScanResult | null>(`/products/scan?code=${encodeURIComponent(c)}`)
      if (!r) return null
      if (r.kind === 'serial') {
        return {
          kind: 'serial',
          product: toLocalProduct(r.product),
          serial: toLocalSerialUnit(r.serial),
        }
      }
      if (r.kind === 'variant') {
        return {
          kind: 'variant',
          product: toLocalProduct(r.product),
          variant: toLocalVariant(r.variant),
        }
      }
      return { kind: 'product', product: toLocalProduct(r.product) }
    } catch {
      return null
    }
  },
  // Only called at product creation (no pre-existing units) — add all in one call.
  setSerialUnits: async (productId: string, units: SerialUnitInput[]): Promise<void> => {
    if (units.length === 0) return
    await cpost<unknown>(`/products/${productId}/serial-units`, { units: serialPayload(units) })
  },
  addSerialUnits: async (
    productId: string,
    units: SerialUnitInput[],
    notes?: string | null,
  ): Promise<LocalSerialUnit[]> =>
    (
      await cpost<ApiSerialUnit[]>(
        `/products/${productId}/serial-units`,
        clean({ units: serialPayload(units), notes }),
      )
    ).map(toLocalSerialUnit),
  retireSerialUnit: (productId: string, unitId: string, reason: string): Promise<void> =>
    cpost<void>(`/products/${productId}/serial-units/${unitId}/retire`, { reason }),
  updateSerialNumber: async (
    productId: string,
    unitId: string,
    serialNumber: string,
  ): Promise<LocalSerialUnit> =>
    toLocalSerialUnit(
      await cpatch<ApiSerialUnit>(`/products/${productId}/serial-units/${unitId}`, {
        serialNumber,
      }),
    ),
  listMovements: async (productId: string): Promise<LocalStockMovement[]> => {
    const res = await cget<PaginatedResult<ApiMovement>>(
      `/inventory/${productId}/movements?limit=100`,
    )
    return res.data.map(toLocalStockMovement)
  },
}
