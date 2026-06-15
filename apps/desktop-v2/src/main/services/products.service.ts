import { randomUUID } from 'crypto'
import type { DatabaseService } from '@biztrack/electron-core'
import type {
  LocalProduct,
  LocalProductImage,
  LocalVariant,
  PaginatedResult,
  ProductImageInput,
  ProductInput,
  ProductListQuery,
  ProductType,
  VariantInput,
} from '../../shared/ipc'
import { paginateRows, toPaginated } from './pagination'

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
  is_serialized: number
  serial_type: string | null
  warranty_months: number | null
  low_stock_threshold: number | null
  reorder_point: number | null
  stock_quantity: number | null
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
}

interface VariantOptionRow {
  id: string
  variant_id: string
  attribute_group_id: string
  attribute_option_id: string
}

/** Stable signature of a variant = its sorted attribute-option ids. */
function variantSignature(optionIds: string[]): string {
  return [...optionIds].sort().join('|')
}

const COLS =
  `p.id, p.name, p.slug, p.description, p.sku, p.barcode, p.price, p.cost_price, p.currency, p.tax_rate,
   p.product_type, p.is_service, p.track_inventory, p.category_id, p.brand_id, p.model_id,
   p.unit_of_measure_id, p.image_url, p.is_active, p.is_featured, p.is_published_online,
   p.online_description, p.online_stock_reserve, p.is_serialized, p.serial_type, p.warranty_months,
   p.low_stock_threshold, p.reorder_point, p.stock_quantity,
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

  create(input: ProductInput): LocalProduct {
    const businessId = this.requireBusinessId()
    const id = randomUUID()
    const now = new Date().toISOString()
    const type = productType(input)
    const isService = type === 'SERVICE'
    const tracks = !isService
    this.db.run(
      `INSERT INTO products
        (id, business_id, name, slug, description, sku, barcode, price, cost_price, currency, tax_rate,
         product_type, is_service, track_inventory, category_id, brand_id, model_id, unit_of_measure_id,
         image_url, is_active, is_featured, is_published_online, online_description, online_stock_reserve,
         is_serialized, serial_type, warranty_months, low_stock_threshold, reorder_point,
         stock_quantity, is_deleted, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'XAF', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
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
        input.isSerialized ? 1 : 0,
        input.serialType ?? null,
        input.warrantyMonths ?? null,
        input.lowStockThreshold ?? null,
        input.reorderPoint ?? null,
        tracks ? (input.openingStock ?? 0) : 0,
        now,
        now,
      ],
    )
    this.enqueue(id, 'UPSERT', businessId, this.payload(input, type), now)
    this.onMutated()
    return this.getOne(id)!
  }

  update(id: string, input: ProductInput): LocalProduct {
    const businessId = this.requireBusinessId()
    const now = new Date().toISOString()
    const type = productType(input)
    const isService = type === 'SERVICE'
    this.db.run(
      `UPDATE products SET
        name = ?, slug = ?, description = ?, sku = ?, barcode = ?, price = ?, cost_price = ?, tax_rate = ?,
        product_type = ?, is_service = ?, track_inventory = ?, category_id = ?, brand_id = ?, model_id = ?,
        unit_of_measure_id = ?, image_url = ?, is_active = ?, is_featured = ?, is_published_online = ?,
        online_description = ?, online_stock_reserve = ?, is_serialized = ?, serial_type = ?,
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
        input.isSerialized ? 1 : 0,
        input.serialType ?? null,
        input.warrantyMonths ?? null,
        input.lowStockThreshold ?? null,
        input.reorderPoint ?? null,
        now,
        id,
        businessId,
      ],
    )
    this.enqueue(id, 'UPSERT', businessId, this.payload(input, type), now)
    this.onMutated()
    return this.getOne(id)!
  }

  remove(id: string): void {
    const businessId = this.requireBusinessId()
    const now = new Date().toISOString()
    this.db.run(
      `UPDATE products SET is_deleted = 1, is_active = 0, updated_at = ? WHERE id = ? AND business_id = ?`,
      [now, id, businessId],
    )
    this.enqueue(id, 'DELETE', businessId, { isDeleted: true }, now)
    this.onMutated()
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
  }

  // ---- variants ------------------------------------------------------------

  listVariants(productId: string): LocalVariant[] {
    const businessId = this.getBusinessId()
    if (!businessId) return []
    const variants = this.db.query<VariantRow>(
      `SELECT id, name, price_override, cost_price_override, sku, is_active, sort_order
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
        this.db.run(
          `UPDATE product_variants SET name = ?, price_override = ?, cost_price_override = ?, sku = ?, is_active = ?, sort_order = ?, updated_at = ?
           WHERE id = ? AND business_id = ?`,
          [v.name, v.priceOverride ?? null, v.costPriceOverride ?? null, v.sku ?? null, v.isActive === false ? 0 : 1, index, now, id, businessId],
        )
      } else {
        this.db.run(
          `INSERT INTO product_variants (id, business_id, product_id, name, price_override, cost_price_override, sku, is_active, sort_order, is_deleted, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
          [id, businessId, productId, v.name, v.priceOverride ?? null, v.costPriceOverride ?? null, v.sku ?? null, v.isActive === false ? 0 : 1, index, now, now],
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
        { productId, name: v.name, priceOverride: v.priceOverride ?? null, costPriceOverride: v.costPriceOverride ?? null, sku: v.sku ?? null, isActive: v.isActive !== false, sortOrder: index },
        now,
      )
    })

    for (const v of existing) {
      if (keepIds.has(v.id)) continue
      this.db.run(`UPDATE product_variants SET is_deleted = 1, is_active = 0, updated_at = ? WHERE id = ?`, [now, v.id])
      this.enqueueVariant('productVariants', v.id, 'DELETE', businessId, { isDeleted: true }, now)
      this.db.run(`UPDATE product_variant_options SET is_deleted = 1, updated_at = ? WHERE variant_id = ?`, [now, v.id])
    }
    this.onMutated()
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
    isSerialized: row.is_serialized === 1,
    serialType: (row.serial_type as LocalProduct['serialType']) ?? null,
    warrantyMonths: row.warranty_months,
    lowStockThreshold: row.low_stock_threshold,
    reorderPoint: row.reorder_point,
    currentStock: row.stock_quantity ?? 0,
    categoryName: row.category_name,
    brandName: row.brand_name,
    unitAbbr: row.unit_abbr,
  }
}
