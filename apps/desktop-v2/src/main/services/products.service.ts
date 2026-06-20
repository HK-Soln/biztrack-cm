import { randomUUID } from 'crypto'
import type { DatabaseService } from '@biztrack/electron-core'
import type {
  LocalProduct,
  LocalProductImage,
  LocalSerialUnit,
  LocalStockMovement,
  LocalVariant,
  PaginatedResult,
  ProductImageInput,
  ProductInput,
  ProductListQuery,
  ProductStats,
  ProductType,
  SerialUnitInput,
  StockMovementType,
  VariantInput,
} from '../../shared/ipc'
import { paginateRows, toPaginated } from './pagination'
import {
  COST_EXPR,
  PRICE_EXPR,
  STOCK_EXPR,
  effectiveStock as effectiveStockFn,
  movementCount as movementCountFn,
  recordStockMovement as recordStockMovementFn,
  setInventoryLevel as setInventoryLevelFn,
} from './stock-ledger'
import type { AuditLogger } from './audit.service'

interface ProductRow {
  id: string
  name: string
  slug: string | null
  description: string | null
  sku: string | null
  barcode: string | null
  price: number
  cost_price: number | null
  currency: string | null
  tax_rate: number
  product_type: string | null
  is_service: number
  track_inventory: number
  category_id: string | null
  brand_id: string | null
  model_id: string | null
  unit_of_measure_id: string | null
  image_url: string | null
  is_active: number
  is_featured: number
  is_published_online: number
  online_description: string | null
  online_stock_reserve: number | null
  meta_title: string | null
  meta_description: string | null
  is_serialized: number
  serial_type: string | null
  warranty_months: number | null
  low_stock_threshold: number | null
  reorder_point: number | null
  stock_quantity: number | null
  effective_stock: number | null
  effective_price: number | null
  effective_cost: number | null
  category_name: string | null
  brand_name: string | null
  unit_abbr: string | null
}

interface ProductImageRow {
  id: string
  product_id: string
  url: string
  alt_text: string | null
  sort_order: number
}

interface VariantRow {
  id: string
  name: string
  price_override: number | null
  cost_price_override: number | null
  sku: string | null
  is_active: number
  sort_order: number
  stock_quantity: number | null
  low_stock_threshold: number | null
}

interface VariantOptionRow {
  id: string
  variant_id: string
  attribute_group_id: string
  attribute_option_id: string
}

interface SerialUnitRow {
  id: string
  product_id: string
  variant_id: string | null
  serial_number: string
  serial_type: string
  status: string
}

interface MovementRow {
  id: string
  type: string
  quantity_change: number
  quantity_before: number
  quantity_after: number
  reference_type: string | null
  reference_id: string | null
  notes: string | null
  performed_by_name: string | null
  created_at: string
}

const OPENING_STOCK_NOTE = 'Opening stock recorded at product creation.'

/** Stable signature of a variant = its sorted attribute-option ids. */
function variantSignature(optionIds: string[]): string {
  return [...optionIds].sort().join('|')
}

const COLS =
  `p.id, p.name, p.slug, p.description, p.sku, p.barcode, p.price, p.cost_price, p.currency, p.tax_rate,
   p.product_type, p.is_service, p.track_inventory, p.category_id, p.brand_id, p.model_id,
   p.unit_of_measure_id, p.image_url, p.is_active, p.is_featured, p.is_published_online,
   p.online_description, p.online_stock_reserve, p.meta_title, p.meta_description,
   p.is_serialized, p.serial_type, p.warranty_months,
   p.low_stock_threshold, p.reorder_point, p.stock_quantity, ${STOCK_EXPR} AS effective_stock,
   ${PRICE_EXPR} AS effective_price, ${COST_EXPR} AS effective_cost,
   c.name AS category_name, b.name AS brand_name, u.abbreviation AS unit_abbr`
const FROM =
  `products p
   LEFT JOIN product_categories c ON c.id = p.category_id
   LEFT JOIN brands b ON b.id = p.brand_id
   LEFT JOIN unit_of_measures u ON u.id = p.unit_of_measure_id`

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140)
}

function productType(input: ProductInput): ProductType {
  if (input.isService) return 'SERVICE'
  return input.productType ?? 'SIMPLE'
}

/** Field-level before/after diff for the audit trail (only changed scalars). */
const AUDITED_FIELDS: (keyof LocalProduct)[] = [
  'name', 'description', 'sku', 'barcode', 'sellingPrice', 'costPrice', 'taxRate',
  'productType', 'categoryId', 'brandId', 'modelId', 'unitOfMeasureId', 'imageUrl',
  'isActive', 'isFeatured', 'isPublishedOnline', 'onlineDescription', 'onlineStockReserve',
  'metaTitle', 'metaDescription', 'isSerialized', 'serialType', 'warrantyMonths',
  'lowStockThreshold', 'reorderPoint',
]
function diffProduct(before: LocalProduct | null, after: LocalProduct): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const b: Record<string, unknown> = {}
  const a: Record<string, unknown> = {}
  for (const f of AUDITED_FIELDS) {
    if (!before || before[f] !== after[f]) {
      b[f] = before ? before[f] : null
      a[f] = after[f]
    }
  }
  return { before: b, after: a }
}

/**
 * Offline-first products. Reads come from local SQLite (synced via pull), joined with
 * category / brand / unit names for display. Writes go local + sync_outbox ('products')
 * then nudge a sync. Stock is read-only here (owned by the Inventory module; opening
 * stock + variants are deferred). Business scope from the active session.
 */
export class ProductsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly getBusinessId: () => string | null,
    private readonly onMutated: () => void,
    private readonly audit?: AuditLogger,
  ) {}

  list(query: ProductListQuery = {}): PaginatedResult<LocalProduct> {
    const businessId = this.getBusinessId()
    if (!businessId) return toPaginated<LocalProduct>([], { total: 0, page: 1, limit: 20, totalPages: 1 })

    let where = 'p.business_id = ? AND p.is_deleted = 0'
    const params: unknown[] = [businessId]
    if (query.categoryId) {
      where += ' AND p.category_id = ?'
      params.push(query.categoryId)
    }
    if (query.brandId) {
      where += ' AND p.brand_id = ?'
      params.push(query.brandId)
    }
    if (query.isActive !== undefined) {
      where += ' AND p.is_active = ?'
      params.push(query.isActive ? 1 : 0)
    }
    if (query.stockStatus && query.stockStatus !== 'all') {
      const thr = 'COALESCE(p.reorder_point, p.low_stock_threshold, 0)'
      const stock = STOCK_EXPR
      if (query.stockStatus === 'out') {
        where += ` AND p.track_inventory = 1 AND ${stock} <= 0`
      } else if (query.stockStatus === 'low') {
        where += ` AND p.track_inventory = 1 AND ${stock} > 0 AND ${thr} > 0 AND ${stock} <= ${thr}`
      } else if (query.stockStatus === 'in') {
        where += ` AND p.track_inventory = 1 AND ${stock} > 0 AND (${thr} = 0 OR ${stock} > ${thr})`
      }
    }

    const { rows, ...meta } = paginateRows<ProductRow>(
      this.db,
      {
        from: FROM,
        columns: COLS,
        where,
        params,
        searchColumns: ['p.name', 'p.sku', 'p.barcode'],
        defaultSort: 'p.name ASC',
        sortMap: { name: 'p.name', price: 'p.price', createdAt: 'p.created_at', updatedAt: 'p.updated_at' },
      },
      query,
    )
    return toPaginated(rows.map(toLocalProduct), meta)
  }

  /** Catalog KPI roll-up for the list header. Aggregated over local SQLite so it
   * works offline; stock metrics consider only inventory-tracked products. */
  stats(): ProductStats {
    const empty: ProductStats = {
      totalSkus: 0,
      categories: 0,
      catalogValueCost: 0,
      retailValue: 0,
      blendedMarginPct: 0,
      lowStock: 0,
      outOfStock: 0,
    }
    const businessId = this.getBusinessId()
    if (!businessId) return empty
    const thr = 'COALESCE(p.reorder_point, p.low_stock_threshold, 0)'
    const stock = STOCK_EXPR
    const row = this.db.get<{
      totalSkus: number
      categories: number
      catalogValueCost: number
      retailValue: number
      lowStock: number
      outOfStock: number
    }>(
      `SELECT
         COUNT(*) AS totalSkus,
         COUNT(DISTINCT p.category_id) AS categories,
         COALESCE(SUM(COALESCE(${COST_EXPR}, 0) * ${stock}), 0) AS catalogValueCost,
         COALESCE(SUM(${PRICE_EXPR} * ${stock}), 0) AS retailValue,
         COALESCE(SUM(CASE WHEN p.track_inventory = 1 AND ${stock} > 0
           AND ${thr} > 0 AND ${stock} <= ${thr} THEN 1 ELSE 0 END), 0) AS lowStock,
         COALESCE(SUM(CASE WHEN p.track_inventory = 1 AND ${stock} <= 0 THEN 1 ELSE 0 END), 0) AS outOfStock
       FROM products p WHERE p.business_id = ? AND p.is_deleted = 0`,
      [businessId],
    )
    if (!row) return empty
    const blendedMarginPct = row.retailValue > 0 ? ((row.retailValue - row.catalogValueCost) / row.retailValue) * 100 : 0
    return { ...row, blendedMarginPct }
  }

  create(input: ProductInput): LocalProduct {
    const businessId = this.requireBusinessId()
    this.assertUnit(input.unitOfMeasureId, businessId)
    if (input.categoryId) this.assertCategorySelectable(input.categoryId, businessId)
    const id = randomUUID()
    const now = new Date().toISOString()
    const type = productType(input)
    const isService = type === 'SERVICE'
    const tracks = !isService
    const currency = this.businessCurrency(businessId)
    this.db.run(
      `INSERT INTO products
        (id, business_id, name, slug, description, sku, barcode, price, cost_price, currency, tax_rate,
         product_type, is_service, track_inventory, category_id, brand_id, model_id, unit_of_measure_id,
         image_url, is_active, is_featured, is_published_online, online_description, online_stock_reserve,
         meta_title, meta_description, is_serialized, serial_type, warranty_months, low_stock_threshold, reorder_point,
         stock_quantity, is_deleted, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        id,
        businessId,
        input.name.trim(),
        slugify(input.name),
        input.description?.trim() || null,
        input.sku?.trim() || null,
        input.barcode?.trim() || null,
        input.sellingPrice,
        input.costPrice ?? null,
        currency,
        input.taxRate ?? 0,
        type,
        isService ? 1 : 0,
        tracks ? 1 : 0,
        input.categoryId ?? null,
        input.brandId ?? null,
        input.modelId ?? null,
        input.unitOfMeasureId,
        input.imageUrl ?? null,
        input.isActive === false ? 0 : 1,
        input.isFeatured ? 1 : 0,
        input.isPublishedOnline ? 1 : 0,
        input.onlineDescription?.trim() || null,
        input.onlineStockReserve ?? 0,
        input.metaTitle?.trim() || null,
        input.metaDescription?.trim() || null,
        input.isSerialized ? 1 : 0,
        input.serialType ?? null,
        input.warrantyMonths ?? null,
        input.lowStockThreshold ?? 0, // column is NOT NULL; 0 = no low-stock alert
        input.reorderPoint ?? null,
        tracks ? (input.openingStock ?? 0) : 0,
        now,
        now,
      ],
    )
    this.enqueue(id, 'UPSERT', businessId, this.payload(input, type), now)
    this.syncOpeningStock(id, businessId, now)
    this.onMutated()
    const created = this.getOne(id)!
    this.audit?.log({ action: 'CREATE', entityType: 'product', entityId: id, entityLabel: created.name, changes: { before: null, after: created } })
    return created
  }

  update(id: string, input: ProductInput): LocalProduct {
    const businessId = this.requireBusinessId()
    this.assertUnit(input.unitOfMeasureId, businessId)
    if (input.categoryId) this.assertCategorySelectable(input.categoryId, businessId)
    const now = new Date().toISOString()
    const type = productType(input)
    const isService = type === 'SERVICE'
    const before = this.getOne(id)
    this.db.run(
      `UPDATE products SET
        name = ?, slug = ?, description = ?, sku = ?, barcode = ?, price = ?, cost_price = ?, tax_rate = ?,
        product_type = ?, is_service = ?, track_inventory = ?, category_id = ?, brand_id = ?, model_id = ?,
        unit_of_measure_id = ?, image_url = ?, is_active = ?, is_featured = ?, is_published_online = ?,
        online_description = ?, online_stock_reserve = ?, meta_title = ?, meta_description = ?,
        is_serialized = ?, serial_type = ?,
        warranty_months = ?, low_stock_threshold = ?, reorder_point = ?, updated_at = ?
       WHERE id = ? AND business_id = ?`,
      [
        input.name.trim(),
        slugify(input.name),
        input.description?.trim() || null,
        input.sku?.trim() || null,
        input.barcode?.trim() || null,
        input.sellingPrice,
        input.costPrice ?? null,
        input.taxRate ?? 0,
        type,
        isService ? 1 : 0,
        isService ? 0 : 1,
        input.categoryId ?? null,
        input.brandId ?? null,
        input.modelId ?? null,
        input.unitOfMeasureId,
        input.imageUrl ?? null,
        input.isActive === false ? 0 : 1,
        input.isFeatured ? 1 : 0,
        input.isPublishedOnline ? 1 : 0,
        input.onlineDescription?.trim() || null,
        input.onlineStockReserve ?? 0,
        input.metaTitle?.trim() || null,
        input.metaDescription?.trim() || null,
        input.isSerialized ? 1 : 0,
        input.serialType ?? null,
        input.warrantyMonths ?? null,
        input.lowStockThreshold ?? 0, // column is NOT NULL; 0 = no low-stock alert
        input.reorderPoint ?? null,
        now,
        id,
        businessId,
      ],
    )
    this.enqueue(id, 'UPSERT', businessId, this.payload(input, type), now)
    this.onMutated()
    const after = this.getOne(id)!
    this.audit?.log({ action: 'UPDATE', entityType: 'product', entityId: id, entityLabel: after.name, changes: diffProduct(before, after) })
    return after
  }

  /**
   * Delete a product. Soft-deletes the product AND cascades to its children
   * (variants + options, serial units, images, inventory level), then writes off
   * any remaining stock as a stock-out movement so the ledger balances to zero.
   * Each child change is enqueued for sync; the whole thing is audited.
   */
  remove(id: string): void {
    const businessId = this.requireBusinessId()
    const now = new Date().toISOString()
    const before = this.getOne(id)
    if (!before) return
    const stockBefore = this.effectiveStock(id)

    // Cascade soft-delete the children (each enqueued for sync).
    const serials = this.db.query<{ id: string }>(
      `SELECT id FROM product_serial_units WHERE business_id = ? AND product_id = ? AND is_deleted = 0`,
      [businessId, id],
    )
    for (const s of serials) {
      this.db.run(`UPDATE product_serial_units SET status = 'DAMAGED', is_deleted = 1, updated_at = ? WHERE id = ?`, [now, s.id])
      this.enqueueSerialUnit(s.id, 'DELETE', businessId, { isDeleted: true }, now)
    }
    const variants = this.db.query<{ id: string }>(
      `SELECT id FROM product_variants WHERE business_id = ? AND product_id = ? AND is_deleted = 0`,
      [businessId, id],
    )
    for (const v of variants) {
      this.db.run(`UPDATE product_variants SET is_deleted = 1, is_active = 0, updated_at = ? WHERE id = ?`, [now, v.id])
      this.db.run(`UPDATE product_variant_options SET is_deleted = 1, updated_at = ? WHERE variant_id = ?`, [now, v.id])
      this.enqueueVariant('productVariants', v.id, 'DELETE', businessId, { isDeleted: true }, now)
    }
    const images = this.db.query<{ id: string }>(
      `SELECT id FROM product_images WHERE business_id = ? AND product_id = ? AND is_deleted = 0`,
      [businessId, id],
    )
    for (const im of images) {
      this.db.run(`UPDATE product_images SET is_deleted = 1, updated_at = ? WHERE id = ?`, [now, im.id])
      this.enqueueImage(im.id, 'DELETE', businessId, { isDeleted: true }, now)
    }

    // Soft-delete the product + zero its own quantity.
    this.db.run(
      `UPDATE products SET is_deleted = 1, is_active = 0, stock_quantity = 0, updated_at = ? WHERE id = ? AND business_id = ?`,
      [now, id, businessId],
    )
    this.enqueue(id, 'DELETE', businessId, { isDeleted: true }, now)

    // Write off any remaining stock (ledger → 0). effectiveStock is 0 now, so
    // recordStockMovement records before=stockBefore, after=0.
    if (stockBefore > 0) {
      this.recordStockMovement(id, businessId, -stockBefore, { referenceType: 'product', referenceId: id, notes: 'Product deleted' }, now)
    }
    this.onMutated()
    this.audit?.log({ action: 'DELETE', entityType: 'product', entityId: id, entityLabel: before.name, changes: { before, after: null } })
  }

  /** Single product by id (for the edit form). */
  get(id: string): LocalProduct | null {
    return this.getOne(id)
  }

  // ---- gallery images ------------------------------------------------------

  listImages(productId: string): LocalProductImage[] {
    const businessId = this.getBusinessId()
    if (!businessId) return []
    const rows = this.db.query<ProductImageRow>(
      `SELECT id, product_id, url, alt_text, sort_order FROM product_images
       WHERE business_id = ? AND product_id = ? AND is_deleted = 0
       ORDER BY sort_order ASC`,
      [businessId, productId],
    )
    return rows.map((r) => ({ id: r.id, productId: r.product_id, url: r.url, altText: r.alt_text, sortOrder: r.sort_order }))
  }

  /** Replace a product's gallery with `images` (diff: add new, soft-delete removed, reindex). */
  setImages(productId: string, images: ProductImageInput[]): void {
    const businessId = this.requireBusinessId()
    const now = new Date().toISOString()
    const existing = this.db.query<ProductImageRow>(
      `SELECT id, product_id, url, alt_text, sort_order FROM product_images
       WHERE business_id = ? AND product_id = ? AND is_deleted = 0`,
      [businessId, productId],
    )
    const keepIds = new Set(images.map((i) => i.id).filter(Boolean) as string[])

    images.forEach((img, index) => {
      const id = img.id ?? randomUUID()
      if (img.id && existing.some((e) => e.id === img.id)) {
        this.db.run(`UPDATE product_images SET url = ?, alt_text = ?, sort_order = ?, updated_at = ? WHERE id = ?`, [
          img.url,
          img.altText ?? null,
          index,
          now,
          id,
        ])
      } else {
        this.db.run(
          `INSERT INTO product_images (id, business_id, product_id, url, alt_text, sort_order, is_deleted, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
          [id, businessId, productId, img.url, img.altText ?? null, index, now, now],
        )
      }
      this.enqueueImage(id, 'UPSERT', businessId, { productId, url: img.url, altText: img.altText ?? null, sortOrder: index }, now)
    })

    for (const e of existing) {
      if (keepIds.has(e.id)) continue
      this.db.run(`UPDATE product_images SET is_deleted = 1, updated_at = ? WHERE id = ?`, [now, e.id])
      this.enqueueImage(e.id, 'DELETE', businessId, { isDeleted: true }, now)
    }
    this.onMutated()
    this.audit?.log({ action: 'UPDATE', entityType: 'product', entityId: productId, entityLabel: this.getOne(productId)?.name ?? null, changes: { before: null, after: { gallery: images.length } } })
  }

  // ---- variants ------------------------------------------------------------

  listVariants(productId: string): LocalVariant[] {
    const businessId = this.getBusinessId()
    if (!businessId) return []
    const variants = this.db.query<VariantRow>(
      `SELECT id, name, price_override, cost_price_override, sku, is_active, sort_order, stock_quantity, low_stock_threshold
       FROM product_variants WHERE business_id = ? AND product_id = ? AND is_deleted = 0
       ORDER BY sort_order ASC`,
      [businessId, productId],
    )
    if (variants.length === 0) return []
    const ph = variants.map(() => '?').join(', ')
    const opts = this.db.query<VariantOptionRow>(
      `SELECT id, variant_id, attribute_group_id, attribute_option_id FROM product_variant_options
       WHERE business_id = ? AND is_deleted = 0 AND variant_id IN (${ph})`,
      [businessId, ...variants.map((v) => v.id)],
    )
    const optsByVariant = new Map<string, VariantOptionRow[]>()
    for (const o of opts) {
      const list = optsByVariant.get(o.variant_id) ?? []
      list.push(o)
      optsByVariant.set(o.variant_id, list)
    }
    return variants.map((v) => ({
      id: v.id,
      name: v.name,
      priceOverride: v.price_override,
      costPriceOverride: v.cost_price_override,
      sku: v.sku,
      isActive: v.is_active === 1,
      sortOrder: v.sort_order,
      stockQuantity: v.stock_quantity ?? 0,
      lowStockThreshold: v.low_stock_threshold,
      options: (optsByVariant.get(v.id) ?? []).map((o) => ({
        attributeGroupId: o.attribute_group_id,
        attributeOptionId: o.attribute_option_id,
      })),
    }))
  }

  /** Replace a product's variants. Matches by attribute-option combination so an
   * existing variant's id (and its synced state) survives edits; adds new combos,
   * soft-deletes removed ones. */
  setVariants(productId: string, variants: VariantInput[]): void {
    const businessId = this.requireBusinessId()
    const now = new Date().toISOString()
    const existing = this.listVariants(productId)
    const existingBySig = new Map(existing.map((v) => [variantSignature(v.options.map((o) => o.attributeOptionId)), v]))
    const keepIds = new Set<string>()

    variants.forEach((v, index) => {
      const sig = variantSignature(v.options.map((o) => o.attributeOptionId))
      const prior = existingBySig.get(sig)
      const id = prior?.id ?? randomUUID()
      keepIds.add(id)
      if (prior) {
        // Stock is owned by inventory after create — only the threshold is editable here.
        this.db.run(
          `UPDATE product_variants SET name = ?, price_override = ?, cost_price_override = ?, sku = ?, is_active = ?, sort_order = ?, low_stock_threshold = ?, updated_at = ?
           WHERE id = ? AND business_id = ?`,
          [v.name, v.priceOverride ?? null, v.costPriceOverride ?? null, v.sku ?? null, v.isActive === false ? 0 : 1, index, v.lowStockThreshold ?? null, now, id, businessId],
        )
      } else {
        this.db.run(
          `INSERT INTO product_variants (id, business_id, product_id, name, price_override, cost_price_override, sku, is_active, sort_order, stock_quantity, low_stock_threshold, is_deleted, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
          [id, businessId, productId, v.name, v.priceOverride ?? null, v.costPriceOverride ?? null, v.sku ?? null, v.isActive === false ? 0 : 1, index, Math.max(v.openingStock ?? 0, 0), v.lowStockThreshold ?? null, now, now],
        )
        // Insert this variant's option links (new combos only).
        for (const opt of v.options) {
          const optId = randomUUID()
          this.db.run(
            `INSERT INTO product_variant_options (id, business_id, variant_id, attribute_group_id, attribute_option_id, is_deleted, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
            [optId, businessId, id, opt.attributeGroupId, opt.attributeOptionId, now, now],
          )
          this.enqueueVariant('productVariantOptions', optId, 'UPSERT', businessId, { variantId: id, attributeGroupId: opt.attributeGroupId, attributeOptionId: opt.attributeOptionId }, now)
        }
      }
      this.enqueueVariant(
        'productVariants',
        id,
        'UPSERT',
        businessId,
        { productId, name: v.name, priceOverride: v.priceOverride ?? null, costPriceOverride: v.costPriceOverride ?? null, sku: v.sku ?? null, isActive: v.isActive !== false, sortOrder: index, openingStock: prior ? undefined : (v.openingStock ?? 0), lowStockThreshold: v.lowStockThreshold ?? null },
        now,
      )
    })

    for (const v of existing) {
      if (keepIds.has(v.id)) continue
      this.db.run(`UPDATE product_variants SET is_deleted = 1, is_active = 0, updated_at = ? WHERE id = ?`, [now, v.id])
      this.enqueueVariant('productVariants', v.id, 'DELETE', businessId, { isDeleted: true }, now)
      this.db.run(`UPDATE product_variant_options SET is_deleted = 1, updated_at = ? WHERE variant_id = ?`, [now, v.id])
    }
    this.syncOpeningStock(productId, businessId, now)
    this.onMutated()
    this.audit?.log({ action: 'UPDATE', entityType: 'product', entityId: productId, entityLabel: this.getOne(productId)?.name ?? null, changes: { before: null, after: { variants: variants.length } } })
  }

  // ---- variant management (movement-based, post-creation) -------------------
  // The variant SET is structure, but adding one (with opening stock) is a stock-in
  // and removing one writes off its remaining stock (a stock-out). Editing a
  // variant's catalog info writes no movement. Offline twin of products/:id/variants.

  /** Add a variant (a stock-in for its opening stock). Serialised variants are
   * created at 0 — their stock comes from serial units. */
  addVariant(productId: string, input: VariantInput): LocalVariant {
    const businessId = this.requireBusinessId()
    const product = this.getOne(productId)
    if (!product) throw new Error('Product not found.')
    const now = new Date().toISOString()
    const sig = variantSignature(input.options.map((o) => o.attributeOptionId))
    if (this.listVariants(productId).some((v) => variantSignature(v.options.map((o) => o.attributeOptionId)) === sig)) {
      throw new Error('A variant with this combination already exists.')
    }
    const id = randomUUID()
    const sortOrder = this.listVariants(productId).length
    const stock = product.isSerialized ? 0 : Math.max(input.openingStock ?? 0, 0)
    this.db.run(
      `INSERT INTO product_variants (id, business_id, product_id, name, price_override, cost_price_override, sku, is_active, sort_order, stock_quantity, low_stock_threshold, is_deleted, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [id, businessId, productId, input.name, input.priceOverride ?? null, input.costPriceOverride ?? null, input.sku ?? null, input.isActive === false ? 0 : 1, sortOrder, stock, input.lowStockThreshold ?? null, now, now],
    )
    for (const opt of input.options) {
      const optId = randomUUID()
      this.db.run(
        `INSERT INTO product_variant_options (id, business_id, variant_id, attribute_group_id, attribute_option_id, is_deleted, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
        [optId, businessId, id, opt.attributeGroupId, opt.attributeOptionId, now, now],
      )
      this.enqueueVariant('productVariantOptions', optId, 'UPSERT', businessId, { variantId: id, attributeGroupId: opt.attributeGroupId, attributeOptionId: opt.attributeOptionId }, now)
    }
    this.enqueueVariant(
      'productVariants',
      id,
      'UPSERT',
      businessId,
      { productId, name: input.name, priceOverride: input.priceOverride ?? null, costPriceOverride: input.costPriceOverride ?? null, sku: input.sku ?? null, isActive: input.isActive !== false, sortOrder, openingStock: stock, lowStockThreshold: input.lowStockThreshold ?? null },
      now,
    )
    if (!product.isSerialized && stock > 0) {
      this.recordStockMovement(productId, businessId, stock, { referenceType: 'product_variant', referenceId: id, notes: `Added variant "${input.name}" (+${stock})` }, now)
    }
    this.audit?.log({ action: 'CREATE', entityType: 'product_variant', entityId: id, entityLabel: input.name, changes: { before: null, after: { productId, name: input.name, openingStock: stock } } })
    this.onMutated()
    return this.listVariants(productId).find((v) => v.id === id)!
  }

  /** Edit a variant's catalog info (name/price/cost/sku/active/threshold). No movement. */
  updateVariant(productId: string, variantId: string, input: VariantInput): LocalVariant {
    const businessId = this.requireBusinessId()
    const prior = this.listVariants(productId).find((v) => v.id === variantId)
    if (!prior) throw new Error('Variant not found.')
    const now = new Date().toISOString()
    this.db.run(
      `UPDATE product_variants SET name = ?, price_override = ?, cost_price_override = ?, sku = ?, is_active = ?, low_stock_threshold = ?, updated_at = ?
       WHERE id = ? AND business_id = ?`,
      [input.name, input.priceOverride ?? null, input.costPriceOverride ?? null, input.sku ?? null, input.isActive === false ? 0 : 1, input.lowStockThreshold ?? null, now, variantId, businessId],
    )
    this.enqueueVariant(
      'productVariants',
      variantId,
      'UPSERT',
      businessId,
      { productId, name: input.name, priceOverride: input.priceOverride ?? null, costPriceOverride: input.costPriceOverride ?? null, sku: input.sku ?? null, isActive: input.isActive !== false, sortOrder: prior.sortOrder, lowStockThreshold: input.lowStockThreshold ?? null },
      now,
    )
    this.audit?.log({
      action: 'UPDATE',
      entityType: 'product_variant',
      entityId: variantId,
      entityLabel: input.name,
      changes: { before: { name: prior.name, priceOverride: prior.priceOverride, costPriceOverride: prior.costPriceOverride, sku: prior.sku, isActive: prior.isActive }, after: { name: input.name, priceOverride: input.priceOverride ?? null, costPriceOverride: input.costPriceOverride ?? null, sku: input.sku ?? null, isActive: input.isActive !== false } },
    })
    this.onMutated()
    return this.listVariants(productId).find((v) => v.id === variantId)!
  }

  /** Remove a variant (writes off its remaining stock). For serialised products,
   * retires the variant's IN_STOCK serial units too. */
  removeVariant(productId: string, variantId: string, reason: string): void {
    const businessId = this.requireBusinessId()
    const product = this.getOne(productId)
    if (!product) throw new Error('Product not found.')
    const variant = this.listVariants(productId).find((v) => v.id === variantId)
    if (!variant) throw new Error('Variant not found.')
    const trimmed = reason.trim()
    if (!trimmed) throw new Error('A reason is required to remove a variant.')
    const now = new Date().toISOString()

    let writeOff: number
    if (product.isSerialized) {
      const units = this.db.query<{ id: string }>(
        `SELECT id FROM product_serial_units WHERE business_id = ? AND product_id = ? AND variant_id = ? AND is_deleted = 0 AND status = 'IN_STOCK'`,
        [businessId, productId, variantId],
      )
      writeOff = units.length
      for (const u of units) {
        this.db.run(`UPDATE product_serial_units SET status = 'DAMAGED', is_deleted = 1, updated_at = ? WHERE id = ?`, [now, u.id])
        this.enqueueSerialUnit(u.id, 'DELETE', businessId, { isDeleted: true }, now)
      }
    } else {
      writeOff = variant.stockQuantity
    }

    this.db.run(`UPDATE product_variants SET is_deleted = 1, is_active = 0, updated_at = ? WHERE id = ?`, [now, variantId])
    this.db.run(`UPDATE product_variant_options SET is_deleted = 1, updated_at = ? WHERE variant_id = ?`, [now, variantId])
    this.enqueueVariant('productVariants', variantId, 'DELETE', businessId, { isDeleted: true }, now)

    if (writeOff > 0) {
      this.recordStockMovement(productId, businessId, -writeOff, { referenceType: 'product_variant', referenceId: variantId, notes: trimmed }, now)
    }
    this.audit?.log({ action: 'DELETE', entityType: 'product_variant', entityId: variantId, entityLabel: variant.name, changes: { before: { name: variant.name, removeReason: trimmed }, after: null } })
    this.onMutated()
  }

  listSerialUnits(productId: string): LocalSerialUnit[] {
    const businessId = this.getBusinessId()
    if (!businessId) return []
    const rows = this.db.query<SerialUnitRow>(
      `SELECT id, product_id, variant_id, serial_number, serial_type, status
       FROM product_serial_units
       WHERE business_id = ? AND product_id = ? AND is_deleted = 0
       ORDER BY created_at ASC`,
      [businessId, productId],
    )
    return rows.map((r) => ({
      id: r.id,
      productId: r.product_id,
      variantId: r.variant_id,
      serialNumber: r.serial_number,
      serialType: r.serial_type as LocalSerialUnit['serialType'],
      status: r.status,
    }))
  }

  /** Replace a product's serial units. Matches live units by serialNumber so their
   * id (and synced state) survives edits; adds new serials, soft-deletes removed. */
  setSerialUnits(productId: string, units: SerialUnitInput[]): void {
    const businessId = this.requireBusinessId()
    const now = new Date().toISOString()
    const existing = this.listSerialUnits(productId)
    const existingBySerial = new Map(existing.map((u) => [u.serialNumber, u]))
    const keepIds = new Set<string>()

    for (const u of units) {
      const serial = u.serialNumber.trim()
      if (!serial) continue
      const prior = existingBySerial.get(serial)
      const id = prior?.id ?? randomUUID()
      keepIds.add(id)
      const variantId = u.variantId ?? null
      if (prior) {
        this.db.run(
          `UPDATE product_serial_units SET variant_id = ?, serial_type = ?, is_deleted = 0, updated_at = ?
           WHERE id = ? AND business_id = ?`,
          [variantId, u.serialType, now, id, businessId],
        )
      } else {
        this.db.run(
          `INSERT INTO product_serial_units (id, business_id, product_id, variant_id, serial_number, serial_type, status, is_deleted, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'IN_STOCK', 0, ?, ?)`,
          [id, businessId, productId, variantId, serial, u.serialType, now, now],
        )
      }
      this.enqueueSerialUnit(
        id,
        'UPSERT',
        businessId,
        { productId, variantId, serialNumber: serial, serialType: u.serialType, status: 'IN_STOCK' },
        now,
      )
    }

    for (const u of existing) {
      if (keepIds.has(u.id)) continue
      this.db.run(`UPDATE product_serial_units SET is_deleted = 1, updated_at = ? WHERE id = ?`, [now, u.id])
      this.enqueueSerialUnit(u.id, 'DELETE', businessId, { isDeleted: true }, now)
    }
    this.syncOpeningStock(productId, businessId, now)
    this.onMutated()
    this.audit?.log({ action: 'UPDATE', entityType: 'product', entityId: productId, entityLabel: this.getOne(productId)?.name ?? null, changes: { before: null, after: { serials: units.length } } })
  }

  // ---- serial-unit management (movement-based, post-creation) ---------------
  // Stock for a serialised product = count of IN_STOCK units, so adding a unit is a
  // stock-in and retiring one is a stock-out (each writes a movement + local audit);
  // correcting a serial number is a catalog edit → no movement. These are the
  // offline twin of products/:productId/serial-units; serial rows still sync.

  /** Add serial units to stock (a stock-in). New numbers become IN_STOCK; a
   * previously retired number is revived. Writes one stock movement + a local
   * audit row per unit (with the active actor). */
  addSerialUnits(productId: string, units: SerialUnitInput[], notes: string | null = null, movementType?: StockMovementType): LocalSerialUnit[] {
    const businessId = this.requireBusinessId()
    const product = this.getOne(productId)
    if (!product) throw new Error('Product not found.')
    if (!product.isSerialized) throw new Error('This product does not track serial numbers.')
    const now = new Date().toISOString()
    const created: LocalSerialUnit[] = []
    const seen = new Set<string>()

    for (const u of units) {
      const serial = u.serialNumber.trim()
      if (!serial || seen.has(serial)) continue
      seen.add(serial)
      const variantId = u.variantId ?? null
      const existing = this.db.get<SerialUnitRow & { is_deleted: number }>(
        `SELECT id, product_id, variant_id, serial_number, serial_type, status, is_deleted
         FROM product_serial_units WHERE business_id = ? AND serial_number = ? LIMIT 1`,
        [businessId, serial],
      )
      let id: string
      if (existing) {
        const live = existing.is_deleted === 0 && (existing.status === 'IN_STOCK' || existing.status === 'RESERVED')
        if (live) throw new Error(`${serial} is already in stock.`)
        id = existing.id
        this.db.run(
          `UPDATE product_serial_units SET status = 'IN_STOCK', is_deleted = 0, variant_id = ?, serial_type = ?, updated_at = ? WHERE id = ?`,
          [variantId, u.serialType, now, id],
        )
      } else {
        id = randomUUID()
        this.db.run(
          `INSERT INTO product_serial_units (id, business_id, product_id, variant_id, serial_number, serial_type, status, is_deleted, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'IN_STOCK', 0, ?, ?)`,
          [id, businessId, productId, variantId, serial, u.serialType, now, now],
        )
      }
      this.enqueueSerialUnit(id, 'UPSERT', businessId, { productId, variantId, serialNumber: serial, serialType: u.serialType, status: 'IN_STOCK' }, now)
      created.push({ id, productId, variantId, serialNumber: serial, serialType: u.serialType, status: 'IN_STOCK' })
    }

    if (created.length > 0) {
      this.recordStockMovement(
        productId,
        businessId,
        created.length,
        { referenceType: 'serial_unit', referenceId: productId, notes: notes?.trim() || `Added ${created.length} serial unit(s)`, type: movementType },
        now,
      )
      for (const u of created) {
        this.audit?.log({
          action: 'CREATE',
          entityType: 'product_serial_unit',
          entityId: u.id,
          entityLabel: u.serialNumber,
          changes: { before: null, after: { productId, variantId: u.variantId, serialNumber: u.serialNumber, status: 'IN_STOCK' } },
        })
      }
      this.onMutated()
    }
    return created
  }

  /** Retire a unit from stock (a stock-out) with a required reason. Only IN_STOCK
   * units can be retired. Writes a −1 movement + a local audit row. */
  retireSerialUnit(productId: string, unitId: string, reason: string): void {
    const businessId = this.requireBusinessId()
    const unit = this.db.get<SerialUnitRow>(
      `SELECT id, product_id, variant_id, serial_number, serial_type, status
       FROM product_serial_units WHERE id = ? AND product_id = ? AND business_id = ? AND is_deleted = 0`,
      [unitId, productId, businessId],
    )
    if (!unit) throw new Error('Serial unit not found.')
    if (unit.status !== 'IN_STOCK') throw new Error('Only in-stock units can be retired.')
    const trimmed = reason.trim()
    if (!trimmed) throw new Error('A reason is required to retire a unit.')
    const now = new Date().toISOString()
    this.db.run(`UPDATE product_serial_units SET status = 'DAMAGED', is_deleted = 1, updated_at = ? WHERE id = ?`, [now, unitId])
    this.enqueueSerialUnit(unitId, 'DELETE', businessId, { isDeleted: true }, now)
    this.recordStockMovement(productId, businessId, -1, { referenceType: 'serial_unit', referenceId: unitId, notes: trimmed }, now)
    this.audit?.log({
      action: 'DELETE',
      entityType: 'product_serial_unit',
      entityId: unitId,
      entityLabel: unit.serial_number,
      changes: { before: { serialNumber: unit.serial_number, status: unit.status, retireReason: trimmed }, after: null },
    })
    this.onMutated()
  }

  /** Correct a unit's serial number (a typo fix). No quantity change → no movement. */
  updateSerialNumber(productId: string, unitId: string, serialNumber: string): LocalSerialUnit {
    const businessId = this.requireBusinessId()
    const unit = this.db.get<SerialUnitRow>(
      `SELECT id, product_id, variant_id, serial_number, serial_type, status
       FROM product_serial_units WHERE id = ? AND product_id = ? AND business_id = ? AND is_deleted = 0`,
      [unitId, productId, businessId],
    )
    if (!unit) throw new Error('Serial unit not found.')
    const serial = serialNumber.trim()
    if (!serial) throw new Error('Serial number is required.')
    if (serial !== unit.serial_number) {
      const clash = this.db.get<{ id: string }>(
        `SELECT id FROM product_serial_units WHERE business_id = ? AND serial_number = ? LIMIT 1`,
        [businessId, serial],
      )
      if (clash && clash.id !== unitId) throw new Error(`${serial} is already in use.`)
    }
    const now = new Date().toISOString()
    this.db.run(`UPDATE product_serial_units SET serial_number = ?, updated_at = ? WHERE id = ?`, [serial, now, unitId])
    this.enqueueSerialUnit(
      unitId,
      'UPSERT',
      businessId,
      { productId, variantId: unit.variant_id, serialNumber: serial, serialType: unit.serial_type, status: unit.status },
      now,
    )
    this.audit?.log({
      action: 'UPDATE',
      entityType: 'product_serial_unit',
      entityId: unitId,
      entityLabel: serial,
      changes: { before: { serialNumber: unit.serial_number }, after: { serialNumber: serial } },
    })
    this.onMutated()
    return {
      id: unitId,
      productId,
      variantId: unit.variant_id,
      serialNumber: serial,
      serialType: unit.serial_type as LocalSerialUnit['serialType'],
      status: unit.status,
    }
  }

  // ---- stock movements (read-only ledger) ----------------------------------

  /** Stock-ledger entries for the detail card, newest first. Until the Inventory
   * module lands the only entry is the opening stock seeded at creation. */
  listMovements(productId: string, limit = 50): LocalStockMovement[] {
    const businessId = this.getBusinessId()
    if (!businessId) return []
    const rows = this.db.query<MovementRow>(
      `SELECT id, type, quantity_change, quantity_before, quantity_after,
              reference_type, reference_id, notes, performed_by_name, created_at
       FROM inventory_movements
       WHERE business_id = ? AND product_id = ?
       ORDER BY created_at DESC, rowid DESC
       LIMIT ?`,
      [businessId, productId, limit],
    )
    return rows.map((r) => ({
      id: r.id,
      type: r.type as StockMovementType,
      quantityChange: r.quantity_change,
      quantityBefore: r.quantity_before,
      quantityAfter: r.quantity_after,
      referenceType: r.reference_type,
      referenceId: r.reference_id,
      notes: r.notes,
      performedByName: r.performed_by_name,
      createdAt: r.created_at,
    }))
  }

  /** The active business's currency (ISO 4217), defaulting to XAF if unknown. */
  private businessCurrency(businessId: string): string {
    return (
      this.db.get<{ currency: string }>(`SELECT currency FROM local_businesses WHERE id = ?`, [businessId])?.currency ??
      'XAF'
    )
  }

  /** Effective on-hand stock for one product (serial count / variant sum / own qty). */
  // Thin delegations to the shared stock-ledger (one implementation, also used by inventory.service).
  private effectiveStock(productId: string): number {
    return effectiveStockFn(this.db, productId)
  }

  private movementCount(productId: string, businessId: string): number {
    return movementCountFn(this.db, businessId, productId)
  }

  private setInventoryLevel(productId: string, businessId: string, qty: number, now: string): void {
    setInventoryLevelFn(this.db, businessId, productId, qty, now)
  }

  /**
   * Seed the one-and-only OPENING_STOCK movement at product creation, so the detail
   * stock card opens with an entry. Creation-only + write-once: if ANY movement
   * already exists it does nothing — opening is never rewritten by a later edit
   * (post-creation quantity changes are their own movements, see recordStockMovement).
   * Serial/variant stock is only known after setSerialUnits/setVariants, so this
   * runs at the end of create()/setVariants()/setSerialUnits().
   *
   * Local projection only: NOT enqueued — the server derives inventory from the
   * synced product/variant/serial payloads (no double-count).
   */
  private syncOpeningStock(productId: string, businessId: string, now: string): void {
    const prod = this.db.get<{ track_inventory: number }>(
      `SELECT track_inventory FROM products WHERE id = ? AND business_id = ?`,
      [productId, businessId],
    )
    if (!prod || prod.track_inventory !== 1) return
    if (this.movementCount(productId, businessId) > 0) return // creation recorded / history started

    const qty = this.effectiveStock(productId)
    if (qty <= 0) return
    this.setInventoryLevel(productId, businessId, qty, now)
    this.db.run(
      `INSERT INTO inventory_movements
        (id, business_id, product_id, type, quantity_change, quantity_before, quantity_after,
         reference_type, reference_id, notes, performed_by_id, performed_by_name, created_at)
       VALUES (?, ?, ?, 'OPENING_STOCK', ?, 0, ?, 'product', ?, ?, NULL, NULL, ?)`,
      [randomUUID(), businessId, productId, qty, qty, productId, OPENING_STOCK_NOTE, now],
    )
  }

  /**
   * Record a post-creation stock delta as a movement; the running balance is the
   * product's effective stock after the change. The first-ever positive movement is
   * the OPENING_STOCK, everything after is a MANUAL_ADJUSTMENT. Local projection.
   */
  private recordStockMovement(
    productId: string,
    businessId: string,
    change: number,
    opts: { referenceType: string; referenceId: string; notes: string; type?: StockMovementType },
    now: string,
  ): void {
    recordStockMovementFn(this.db, businessId, productId, change, opts, now)
  }

  private enqueueSerialUnit(
    recordId: string,
    operation: 'UPSERT' | 'DELETE',
    businessId: string,
    payload: Record<string, unknown>,
    now: string,
  ): void {
    this.db.run(
      `INSERT INTO sync_outbox (id, entity, record_id, operation, payload, status, attempt_count, created_at, updated_at)
       VALUES (?, 'productSerialUnits', ?, ?, ?, 'pending', 0, ?, ?)
       ON CONFLICT(entity, record_id) DO UPDATE SET
         operation = excluded.operation, payload = excluded.payload, status = 'pending',
         attempt_count = 0, next_attempt_at = NULL, last_error = NULL, updated_at = excluded.updated_at`,
      [randomUUID(), recordId, operation, JSON.stringify({ id: recordId, businessId, ...payload }), now, now],
    )
  }

  private enqueueVariant(
    entity: 'productVariants' | 'productVariantOptions',
    recordId: string,
    operation: 'UPSERT' | 'DELETE',
    businessId: string,
    payload: Record<string, unknown>,
    now: string,
  ): void {
    this.db.run(
      `INSERT INTO sync_outbox (id, entity, record_id, operation, payload, status, attempt_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?)
       ON CONFLICT(entity, record_id) DO UPDATE SET
         operation = excluded.operation, payload = excluded.payload, status = 'pending',
         attempt_count = 0, next_attempt_at = NULL, last_error = NULL, updated_at = excluded.updated_at`,
      [randomUUID(), entity, recordId, operation, JSON.stringify({ id: recordId, businessId, ...payload }), now, now],
    )
  }

  private enqueueImage(
    recordId: string,
    operation: 'UPSERT' | 'DELETE',
    businessId: string,
    payload: Record<string, unknown>,
    now: string,
  ): void {
    this.db.run(
      `INSERT INTO sync_outbox (id, entity, record_id, operation, payload, status, attempt_count, created_at, updated_at)
       VALUES (?, 'productImages', ?, ?, ?, 'pending', 0, ?, ?)
       ON CONFLICT(entity, record_id) DO UPDATE SET
         operation = excluded.operation, payload = excluded.payload, status = 'pending',
         attempt_count = 0, next_attempt_at = NULL, last_error = NULL, updated_at = excluded.updated_at`,
      [randomUUID(), recordId, operation, JSON.stringify({ id: recordId, businessId, ...payload }), now, now],
    )
  }

  // ---- internals -----------------------------------------------------------

  private getOne(id: string): LocalProduct | null {
    const row = this.db.get<ProductRow>(`SELECT ${COLS} FROM ${FROM} WHERE p.id = ?`, [id])
    return row ? toLocalProduct(row) : null
  }

  private requireBusinessId(): string {
    const businessId = this.getBusinessId()
    if (!businessId) throw new Error('No active business.')
    return businessId
  }

  /**
   * Every product must carry a valid unit of measure (system unit or one owned by the
   * business). Enforced here so an empty or stale unit can never be persisted, whatever
   * the caller — the form's "required" hint is a convenience, this is the guarantee.
   */
  private assertUnit(unitId: string | null | undefined, businessId: string): void {
    const id = (unitId ?? '').trim()
    if (!id) throw new Error('A unit of measure is required.')
    const unit = this.db.get<{ id: string }>(
      `SELECT id FROM unit_of_measures WHERE id = ? AND is_deleted = 0 AND (business_id IS NULL OR business_id = ?)`,
      [id, businessId],
    )
    if (!unit) throw new Error('Selected unit of measure does not exist.')
  }

  /**
   * A product may only be placed in a terminal (leaf) category — one with no active
   * sub-categories. Branch categories are containers, not shelves. Enforced here so the
   * rule holds for every caller (UI, import, sync replay), not just the product form.
   */
  private assertCategorySelectable(categoryId: string, businessId: string): void {
    const category = this.db.get<{ id: string }>(
      `SELECT id FROM product_categories WHERE id = ? AND business_id = ? AND is_deleted = 0`,
      [categoryId, businessId],
    )
    if (!category) throw new Error('Selected category does not exist.')
    const child = this.db.get<{ id: string }>(
      `SELECT id FROM product_categories WHERE parent_id = ? AND is_deleted = 0 AND is_active = 1 LIMIT 1`,
      [categoryId],
    )
    if (child) {
      throw new Error('Choose a terminal sub-category — this category has sub-categories under it.')
    }
  }

  private payload(input: ProductInput, type: ProductType): Record<string, unknown> {
    return {
      name: input.name.trim(),
      description: input.description?.trim() || null,
      sku: input.sku?.trim() || null,
      barcode: input.barcode?.trim() || null,
      sellingPrice: input.sellingPrice,
      costPrice: input.costPrice ?? null,
      taxRate: input.taxRate ?? 0,
      unitOfMeasureId: input.unitOfMeasureId,
      categoryId: input.categoryId ?? null,
      brandId: input.brandId ?? null,
      modelId: input.modelId ?? null,
      imageUrl: input.imageUrl ?? null,
      productType: type,
      isService: type === 'SERVICE',
      isActive: input.isActive !== false,
      isFeatured: input.isFeatured === true,
      isPublishedOnline: input.isPublishedOnline === true,
      onlineDescription: input.onlineDescription?.trim() || null,
      onlineStockReserve: input.onlineStockReserve ?? 0,
      metaTitle: input.metaTitle?.trim() || null,
      metaDescription: input.metaDescription?.trim() || null,
      isSerialized: input.isSerialized === true,
      serialType: input.serialType ?? null,
      warrantyMonths: input.warrantyMonths ?? null,
      // Inventory fields — the API uses these to seed the inventory level on create.
      openingStock: input.openingStock ?? 0,
      lowStockThreshold: input.lowStockThreshold ?? null,
      reorderPoint: input.reorderPoint ?? null,
    }
  }

  private enqueue(
    recordId: string,
    operation: 'UPSERT' | 'DELETE',
    businessId: string,
    payload: Record<string, unknown>,
    now: string,
  ): void {
    this.db.run(
      `INSERT INTO sync_outbox (id, entity, record_id, operation, payload, status, attempt_count, created_at, updated_at)
       VALUES (?, 'products', ?, ?, ?, 'pending', 0, ?, ?)
       ON CONFLICT(entity, record_id) DO UPDATE SET
         operation = excluded.operation, payload = excluded.payload, status = 'pending',
         attempt_count = 0, next_attempt_at = NULL, last_error = NULL, updated_at = excluded.updated_at`,
      [randomUUID(), recordId, operation, JSON.stringify({ id: recordId, businessId, ...payload }), now, now],
    )
  }
}

function toLocalProduct(row: ProductRow): LocalProduct {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    sku: row.sku,
    barcode: row.barcode,
    sellingPrice: row.price,
    costPrice: row.cost_price,
    effectiveSellingPrice: row.effective_price ?? row.price,
    effectiveCostPrice: row.effective_cost ?? row.cost_price,
    currency: row.currency ?? 'XAF',
    taxRate: row.tax_rate,
    productType: (row.product_type as ProductType) ?? 'SIMPLE',
    isService: row.is_service === 1,
    trackInventory: row.track_inventory === 1,
    categoryId: row.category_id,
    brandId: row.brand_id,
    modelId: row.model_id,
    unitOfMeasureId: row.unit_of_measure_id,
    imageUrl: row.image_url,
    isActive: row.is_active === 1,
    isFeatured: row.is_featured === 1,
    isPublishedOnline: row.is_published_online === 1,
    onlineDescription: row.online_description,
    onlineStockReserve: row.online_stock_reserve ?? 0,
    metaTitle: row.meta_title,
    metaDescription: row.meta_description,
    isSerialized: row.is_serialized === 1,
    serialType: (row.serial_type as LocalProduct['serialType']) ?? null,
    warrantyMonths: row.warranty_months,
    lowStockThreshold: row.low_stock_threshold,
    reorderPoint: row.reorder_point,
    currentStock: row.effective_stock ?? row.stock_quantity ?? 0,
    categoryName: row.category_name,
    brandName: row.brand_name,
    unitAbbr: row.unit_abbr,
  }
}
