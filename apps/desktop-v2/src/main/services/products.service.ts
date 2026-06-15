import { randomUUID } from 'crypto'
import type { DatabaseService } from '@biztrack/electron-core'
import type {
  LocalProduct,
  PaginatedResult,
  ProductInput,
  ProductListQuery,
  ProductType,
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
  stock_quantity: number | null
  category_name: string | null
  brand_name: string | null
  unit_abbr: string | null
}

const COLS =
  `p.id, p.name, p.slug, p.description, p.sku, p.barcode, p.price, p.cost_price, p.currency, p.tax_rate,
   p.product_type, p.is_service, p.track_inventory, p.category_id, p.brand_id, p.model_id,
   p.unit_of_measure_id, p.image_url, p.is_active, p.stock_quantity,
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
    this.db.run(
      `INSERT INTO products
        (id, business_id, name, slug, description, sku, barcode, price, cost_price, currency, tax_rate,
         product_type, is_service, track_inventory, category_id, brand_id, model_id, unit_of_measure_id,
         image_url, is_active, stock_quantity, is_deleted, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'XAF', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
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
        isService ? 0 : 1,
        input.categoryId ?? null,
        input.brandId ?? null,
        input.modelId ?? null,
        input.unitOfMeasureId,
        input.imageUrl ?? null,
        input.isActive === false ? 0 : 1,
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
        unit_of_measure_id = ?, image_url = ?, is_active = ?, updated_at = ?
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
    currentStock: row.stock_quantity ?? 0,
    categoryName: row.category_name,
    brandName: row.brand_name,
    unitAbbr: row.unit_abbr,
  }
}
