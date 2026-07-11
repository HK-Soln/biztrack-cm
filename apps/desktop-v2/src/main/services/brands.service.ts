import { randomUUID } from 'crypto'
import type { DatabaseService } from '@biztrack/electron-core'
import type {
  BrandInput,
  BrandListQuery,
  LocalBrand,
  LocalModel,
  ModelInput,
  PaginatedResult,
} from '../../shared/ipc'
import { paginateRows, toPaginated } from './pagination'
import type { AuditLogger } from './audit.service'

interface BrandRow {
  id: string
  name: string
  slug: string | null
  logo_url: string | null
  description: string | null
  is_active: number
  sort_order: number
}

interface ModelRow {
  id: string
  brand_id: string
  name: string
  is_active: number
  sort_order: number
}

interface LinkRow {
  id: string
  brand_id: string
  category_id: string
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140)
}

/**
 * Offline-first brands & models. Brands link to categories many-to-many and own
 * models. Reads come from local SQLite (synced via pull); writes go to local SQLite +
 * sync_outbox (entities: brands / models / brandCategories) then nudge a sync. Category
 * links are optional — a brand with none surfaces all terminal categories. Business
 * scope from the active session.
 */
export class BrandsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly getBusinessId: () => string | null,
    private readonly onMutated: () => void,
    private readonly audit?: AuditLogger,
  ) {}

  /** Paginated brands (default 20) with search + optional category filter; each brand
   * hydrated with its models + linked category ids. */
  list(query: BrandListQuery = {}): PaginatedResult<LocalBrand> {
    const businessId = this.getBusinessId()
    if (!businessId)
      return toPaginated<LocalBrand>([], { total: 0, page: 1, limit: 20, totalPages: 1 })

    let where = 'business_id = ? AND is_deleted = 0'
    const params: unknown[] = [businessId]
    if (query.categoryId) {
      where +=
        ' AND id IN (SELECT brand_id FROM brand_categories WHERE category_id = ? AND is_deleted = 0)'
      params.push(query.categoryId)
    }

    const { rows, ...meta } = paginateRows<BrandRow>(
      this.db,
      {
        from: 'brands',
        columns: 'id, name, slug, logo_url, description, is_active, sort_order',
        where,
        params,
        searchColumns: ['name', 'slug'],
        defaultSort: 'sort_order ASC, name ASC',
        sortMap: { name: 'name', sortOrder: 'sort_order' },
      },
      query,
    )
    return toPaginated(this.hydrateBrands(businessId, rows), meta)
  }

  /** Attach models + linked category ids to a set of brand rows. */
  private hydrateBrands(businessId: string, brandRows: BrandRow[]): LocalBrand[] {
    if (brandRows.length === 0) return []
    const brandIds = brandRows.map((b) => b.id)
    const placeholders = brandIds.map(() => '?').join(', ')
    const models = this.db.query<ModelRow>(
      `SELECT id, brand_id, name, is_active, sort_order
       FROM models WHERE business_id = ? AND is_deleted = 0 AND brand_id IN (${placeholders})
       ORDER BY sort_order ASC, name ASC`,
      [businessId, ...brandIds],
    )
    const links = this.db.query<LinkRow>(
      `SELECT id, brand_id, category_id FROM brand_categories
       WHERE business_id = ? AND is_deleted = 0 AND brand_id IN (${placeholders})`,
      [businessId, ...brandIds],
    )
    const modelsByBrand = new Map<string, LocalModel[]>()
    for (const m of models) {
      const list = modelsByBrand.get(m.brand_id) ?? []
      list.push(toModel(m))
      modelsByBrand.set(m.brand_id, list)
    }
    const catsByBrand = new Map<string, string[]>()
    for (const l of links) {
      const list = catsByBrand.get(l.brand_id) ?? []
      list.push(l.category_id)
      catsByBrand.set(l.brand_id, list)
    }
    return brandRows.map((b) => ({
      id: b.id,
      name: b.name,
      slug: b.slug,
      logoUrl: b.logo_url,
      description: b.description,
      isActive: b.is_active === 1,
      sortOrder: b.sort_order,
      categoryIds: catsByBrand.get(b.id) ?? [],
      models: modelsByBrand.get(b.id) ?? [],
    }))
  }

  create(input: BrandInput): LocalBrand {
    const businessId = this.requireBusinessId()
    const categoryIds = this.resolveCategories(input.categoryIds, businessId)
    const id = randomUUID()
    const now = new Date().toISOString()
    const slug = slugify(input.name)
    this.db.run(
      `INSERT INTO brands
        (id, business_id, name, slug, logo_url, description, is_active, sort_order, is_deleted, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        id,
        businessId,
        input.name.trim(),
        slug,
        input.logoUrl ?? null,
        input.description?.trim() || null,
        input.isActive === false ? 0 : 1,
        input.sortOrder ?? 0,
        now,
        now,
      ],
    )
    this.enqueue('brands', id, 'UPSERT', businessId, this.brandPayload(input, slug), now)
    this.syncCategoryLinks(id, businessId, categoryIds, now)
    this.onMutated()
    const created = this.getOne(id)!
    this.audit?.log({
      action: 'CREATE',
      entityType: 'brand',
      entityId: id,
      entityLabel: created.name,
      changes: { before: null, after: created },
    })
    return created
  }

  update(id: string, input: BrandInput): LocalBrand {
    const businessId = this.requireBusinessId()
    const categoryIds = this.resolveCategories(input.categoryIds, businessId)
    const now = new Date().toISOString()
    const slug = slugify(input.name)
    this.db.run(
      `UPDATE brands
       SET name = ?, slug = ?, logo_url = ?, description = ?, is_active = ?, sort_order = ?, updated_at = ?
       WHERE id = ? AND business_id = ?`,
      [
        input.name.trim(),
        slug,
        input.logoUrl ?? null,
        input.description?.trim() || null,
        input.isActive === false ? 0 : 1,
        input.sortOrder ?? 0,
        now,
        id,
        businessId,
      ],
    )
    this.enqueue('brands', id, 'UPSERT', businessId, this.brandPayload(input, slug), now)
    this.syncCategoryLinks(id, businessId, categoryIds, now)
    this.onMutated()
    const updated = this.getOne(id)!
    this.audit?.log({
      action: 'UPDATE',
      entityType: 'brand',
      entityId: id,
      entityLabel: updated.name,
      changes: { before: null, after: updated },
    })
    return updated
  }

  remove(id: string): void {
    const businessId = this.requireBusinessId()
    const now = new Date().toISOString()
    const before = this.getOne(id)
    const inUse = this.db.get<{ n: number }>(
      `SELECT 1 AS n FROM products WHERE brand_id = ? AND business_id = ? AND is_deleted = 0 LIMIT 1`,
      [id, businessId],
    )
    if (inUse) {
      throw new Error('This brand is still used by one or more products and cannot be deleted.')
    }
    this.db.run(
      `UPDATE brands SET is_deleted = 1, is_active = 0, updated_at = ? WHERE id = ? AND business_id = ?`,
      [now, id, businessId],
    )
    this.enqueue('brands', id, 'DELETE', businessId, { isDeleted: true }, now)
    this.onMutated()
    this.audit?.log({
      action: 'DELETE',
      entityType: 'brand',
      entityId: id,
      entityLabel: before?.name ?? null,
      changes: { before, after: null },
    })
  }

  // ---- models --------------------------------------------------------------

  addModel(brandId: string, input: ModelInput): LocalModel {
    const businessId = this.requireBusinessId()
    const id = randomUUID()
    const now = new Date().toISOString()
    const sortOrder = this.nextModelOrder(businessId, brandId)
    this.db.run(
      `INSERT INTO models (id, business_id, brand_id, name, slug, is_active, sort_order, is_deleted, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?, 0, ?, ?)`,
      [
        id,
        businessId,
        brandId,
        input.name.trim(),
        input.isActive === false ? 0 : 1,
        sortOrder,
        now,
        now,
      ],
    )
    this.enqueue(
      'models',
      id,
      'UPSERT',
      businessId,
      { brandId, name: input.name.trim(), sortOrder, isActive: input.isActive !== false },
      now,
    )
    this.onMutated()
    const created = this.getModel(id)!
    this.audit?.log({
      action: 'CREATE',
      entityType: 'model',
      entityId: id,
      entityLabel: created.name,
      changes: { before: null, after: created },
    })
    return created
  }

  updateModel(modelId: string, input: ModelInput): LocalModel {
    const businessId = this.requireBusinessId()
    const now = new Date().toISOString()
    const existing = this.db.get<ModelRow>(
      `SELECT id, brand_id, name, is_active, sort_order FROM models WHERE id = ? AND business_id = ?`,
      [modelId, businessId],
    )
    if (!existing) throw new Error('Model not found.')
    this.db.run(
      `UPDATE models SET name = ?, is_active = ?, updated_at = ? WHERE id = ? AND business_id = ?`,
      [input.name.trim(), input.isActive === false ? 0 : 1, now, modelId, businessId],
    )
    this.enqueue(
      'models',
      modelId,
      'UPSERT',
      businessId,
      {
        brandId: existing.brand_id,
        name: input.name.trim(),
        sortOrder: existing.sort_order,
        isActive: input.isActive !== false,
      },
      now,
    )
    this.onMutated()
    const updated = this.getModel(modelId)!
    this.audit?.log({
      action: 'UPDATE',
      entityType: 'model',
      entityId: modelId,
      entityLabel: updated.name,
      changes: { before: null, after: updated },
    })
    return updated
  }

  removeModel(modelId: string): void {
    const businessId = this.requireBusinessId()
    const now = new Date().toISOString()
    const before = this.getModel(modelId)
    const inUse = this.db.get<{ n: number }>(
      `SELECT 1 AS n FROM products WHERE model_id = ? AND business_id = ? AND is_deleted = 0 LIMIT 1`,
      [modelId, businessId],
    )
    if (inUse) {
      throw new Error('This model is still used by one or more products and cannot be deleted.')
    }
    this.db.run(
      `UPDATE models SET is_deleted = 1, is_active = 0, updated_at = ? WHERE id = ? AND business_id = ?`,
      [now, modelId, businessId],
    )
    this.enqueue('models', modelId, 'DELETE', businessId, { isDeleted: true }, now)
    this.onMutated()
    this.audit?.log({
      action: 'DELETE',
      entityType: 'model',
      entityId: modelId,
      entityLabel: before?.name ?? null,
      changes: { before, after: null },
    })
  }

  // ---- internals -----------------------------------------------------------

  /** Diff the brand's category links against `categoryIds`: add new, soft-delete removed. */
  private syncCategoryLinks(
    brandId: string,
    businessId: string,
    categoryIds: string[],
    now: string,
  ): void {
    const existing = this.db.query<LinkRow>(
      `SELECT id, brand_id, category_id FROM brand_categories WHERE business_id = ? AND brand_id = ? AND is_deleted = 0`,
      [businessId, brandId],
    )
    const existingByCat = new Map(existing.map((l) => [l.category_id, l]))
    const desired = new Set(categoryIds)

    for (const categoryId of categoryIds) {
      if (existingByCat.has(categoryId)) continue
      const id = randomUUID()
      this.db.run(
        `INSERT INTO brand_categories (id, business_id, brand_id, category_id, is_deleted, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, ?, ?)`,
        [id, businessId, brandId, categoryId, now, now],
      )
      this.enqueue('brandCategories', id, 'UPSERT', businessId, { brandId, categoryId }, now)
    }
    for (const link of existing) {
      if (desired.has(link.category_id)) continue
      this.db.run(`UPDATE brand_categories SET is_deleted = 1, updated_at = ? WHERE id = ?`, [
        now,
        link.id,
      ])
      this.enqueue('brandCategories', link.id, 'DELETE', businessId, { isDeleted: true }, now)
    }
  }

  private resolveCategories(categoryIds: string[] | undefined, businessId: string): string[] {
    const ids = [...new Set((categoryIds ?? []).filter(Boolean))]
    // Categories are optional: a brand with none surfaces ALL terminal categories when
    // picking a product's category. When provided, brands attach at ANY level (a linked
    // branch expands to its leaves) — we only require that each linked category exists.
    if (ids.length === 0) return []
    const placeholders = ids.map(() => '?').join(', ')
    const rows = this.db.query<{ id: string }>(
      `SELECT id FROM product_categories WHERE business_id = ? AND is_deleted = 0 AND id IN (${placeholders})`,
      [businessId, ...ids],
    )
    const known = new Set(rows.map((r) => r.id))
    for (const id of ids) {
      if (!known.has(id)) throw new Error('One of the selected categories does not exist.')
    }
    return ids
  }

  /** Single brand by id (with its category links + models) — for the product form. */
  get(id: string): LocalBrand | null {
    return this.getOne(id)
  }

  private getOne(id: string): LocalBrand | null {
    const businessId = this.getBusinessId()
    if (!businessId) return null
    const row = this.db.get<BrandRow>(
      `SELECT id, name, slug, logo_url, description, is_active, sort_order FROM brands WHERE id = ? AND business_id = ?`,
      [id, businessId],
    )
    return row ? (this.hydrateBrands(businessId, [row])[0] ?? null) : null
  }

  private getModel(id: string): LocalModel | null {
    const row = this.db.get<ModelRow>(
      `SELECT id, brand_id, name, is_active, sort_order FROM models WHERE id = ?`,
      [id],
    )
    return row ? toModel(row) : null
  }

  private nextModelOrder(businessId: string, brandId: string): number {
    const row = this.db.get<{ n: number | null }>(
      `SELECT MAX(sort_order) AS n FROM models WHERE business_id = ? AND brand_id = ? AND is_deleted = 0`,
      [businessId, brandId],
    )
    return (row?.n ?? -1) + 1
  }

  private requireBusinessId(): string {
    const businessId = this.getBusinessId()
    if (!businessId) throw new Error('No active business.')
    return businessId
  }

  private brandPayload(input: BrandInput, slug: string): Record<string, unknown> {
    return {
      name: input.name.trim(),
      slug,
      logoUrl: input.logoUrl ?? null,
      description: input.description?.trim() || null,
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive !== false,
    }
  }

  private enqueue(
    entity: 'brands' | 'models' | 'brandCategories',
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
      [
        randomUUID(),
        entity,
        recordId,
        operation,
        JSON.stringify({ id: recordId, businessId, ...payload }),
        now,
        now,
      ],
    )
  }
}

function toModel(row: ModelRow): LocalModel {
  return {
    id: row.id,
    brandId: row.brand_id,
    name: row.name,
    isActive: row.is_active === 1,
    sortOrder: row.sort_order,
  }
}
