import { randomUUID } from 'crypto'
import type { DatabaseService } from '@biztrack/electron-core'
import type {
  CategoryInput,
  CategoryListQuery,
  CategoryParentOptionsQuery,
  CategorySelectableQuery,
  LocalCategory,
  PaginatedResult,
} from '../../shared/ipc'
import { paginateRows, toPaginated } from './pagination'
import type { AuditLogger } from './audit.service'

interface CategoryRow {
  id: string
  name: string
  slug: string | null
  description: string | null
  color: string | null
  icon: string | null
  image_url: string | null
  sort_order: number
  parent_id: string | null
  depth: number
  is_active: number
  show_online: number
}

const SELECT_COLS =
  'id, name, slug, description, color, icon, image_url, sort_order, parent_id, depth, is_active, show_online'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
}

/**
 * Offline-first product categories. Reads come from local SQLite (synced by the sync
 * engine); writes go to local SQLite + the sync_outbox in one step, then nudge a sync.
 * The renderer never sees the businessId — it's resolved from the active session here.
 */
export class CategoriesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly getBusinessId: () => string | null,
    private readonly onMutated: () => void,
    private readonly audit?: AuditLogger,
  ) {}

  /** Paginated list for the categories screen (default 20). Supports search + filters. */
  list(query: CategoryListQuery = {}): PaginatedResult<LocalCategory> {
    const businessId = this.getBusinessId()
    if (!businessId)
      return toPaginated<LocalCategory>([], { total: 0, page: 1, limit: 20, totalPages: 1 })

    let where = 'business_id = ? AND is_deleted = 0'
    const params: unknown[] = [businessId]
    if (query.parentId !== undefined) {
      if (query.parentId === null) {
        where += ' AND parent_id IS NULL'
      } else {
        where += ' AND parent_id = ?'
        params.push(query.parentId)
      }
    }
    if (query.isActive !== undefined) {
      where += ' AND is_active = ?'
      params.push(query.isActive ? 1 : 0)
    }
    if (query.depth !== undefined) {
      where += ' AND depth = ?'
      params.push(query.depth)
    }

    const { rows, ...meta } = paginateRows<CategoryRow>(
      this.db,
      {
        from: 'product_categories',
        columns: SELECT_COLS,
        where,
        params,
        searchColumns: ['name', 'slug'],
        defaultSort: 'sort_order ASC, name ASC',
        sortMap: { name: 'name', sortOrder: 'sort_order', createdAt: 'created_at' },
      },
      query,
    )
    return toPaginated(rows.map(toLocalCategory), meta)
  }

  /** Full set (no pagination) — for the parent picker / tree maths in the form. */
  listAll(): LocalCategory[] {
    const businessId = this.getBusinessId()
    if (!businessId) return []
    const rows = this.db.query<CategoryRow>(
      `SELECT ${SELECT_COLS}
       FROM product_categories
       WHERE business_id = ? AND is_deleted = 0
       ORDER BY sort_order ASC, name ASC`,
      [businessId],
    )
    return rows.map(toLocalCategory)
  }

  /**
   * Terminal categories a product can be placed in: leaves (no active sub-categories),
   * at ANY depth — so a simple top-level category with no children is selectable too.
   * When `brandId` is given, the result is the union of leaves under each of the brand's
   * linked categories (a linked leaf resolves to itself; a linked branch expands to the
   * leaves in its subtree). Eligibility lives here, not in the renderer.
   */
  listSelectable(query: CategorySelectableQuery = {}): LocalCategory[] {
    const businessId = this.getBusinessId()
    if (!businessId) return []
    const rows = this.allRows(businessId)
    const parentIds = new Set(rows.filter((r) => r.parent_id).map((r) => r.parent_id as string))
    let leaves = rows.filter((r) => r.is_active === 1 && !parentIds.has(r.id))

    if (query.brandId) {
      const linkIds = this.brandCategoryIds(businessId, query.brandId)
      // A brand with no category links surfaces every terminal category.
      if (linkIds.length > 0) {
        const allowed = this.leavesUnder(rows, linkIds)
        leaves = leaves.filter((r) => allowed.has(r.id))
      }
    }
    leaves = filterBySearch(leaves, query.search)
    return sortRows(leaves).map(toLocalCategory)
  }

  /**
   * Categories that may serve as a parent: depth < 3, no products attached, and no
   * variant options attached — and never the category itself or one of its descendants.
   * A category becomes "terminal" the moment it gains products or variant options.
   */
  listParentOptions(query: CategoryParentOptionsQuery = {}): LocalCategory[] {
    const businessId = this.getBusinessId()
    if (!businessId) return []
    const rows = this.allRows(businessId)
    const blocked = new Set<string>()
    if (query.excludeId) {
      blocked.add(query.excludeId)
      for (const d of collectDescendants(rows, query.excludeId)) blocked.add(d)
    }
    const withProducts = this.categoryIdsWithProducts(businessId)
    const withVariants = this.categoryIdsWithVariantOptions(businessId)
    let options = rows.filter(
      (r) =>
        r.depth < 3 && !blocked.has(r.id) && !withProducts.has(r.id) && !withVariants.has(r.id),
    )
    options = filterBySearch(options, query.search)
    return sortRows(options).map(toLocalCategory)
  }

  create(input: CategoryInput): LocalCategory {
    const businessId = this.requireBusinessId()
    if (input.parentId) this.assertParentEligible(input.parentId, businessId, null)
    const id = randomUUID()
    const now = new Date().toISOString()
    const depth = this.depthFor(input.parentId ?? null)
    this.db.run(
      `INSERT INTO product_categories
        (id, business_id, name, slug, description, color, icon, image_url, sort_order, parent_id, depth, is_active, show_online, is_deleted, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        id,
        businessId,
        input.name.trim(),
        slugify(input.name),
        input.description?.trim() || null,
        input.color ?? null,
        input.icon ?? null,
        input.imageUrl ?? null,
        input.sortOrder ?? 0,
        input.parentId ?? null,
        depth,
        input.isActive === false ? 0 : 1,
        input.showOnline === false ? 0 : 1,
        now,
        now,
      ],
    )
    this.enqueue(id, 'UPSERT', businessId, this.upsertPayload(input, depth), now)
    this.onMutated()
    const created = this.getOne(id)!
    this.audit?.log({
      action: 'CREATE',
      entityType: 'product_category',
      entityId: id,
      entityLabel: created.name,
      changes: { before: null, after: created },
    })
    return created
  }

  update(id: string, input: CategoryInput): LocalCategory {
    const businessId = this.requireBusinessId()
    if (input.parentId) this.assertParentEligible(input.parentId, businessId, id)
    const now = new Date().toISOString()
    const depth = this.depthFor(input.parentId ?? null)
    this.db.run(
      `UPDATE product_categories
       SET name = ?, slug = ?, description = ?, color = ?, icon = ?, image_url = ?, sort_order = ?, parent_id = ?, depth = ?, is_active = ?, show_online = ?, updated_at = ?
       WHERE id = ? AND business_id = ?`,
      [
        input.name.trim(),
        slugify(input.name),
        input.description?.trim() || null,
        input.color ?? null,
        input.icon ?? null,
        input.imageUrl ?? null,
        input.sortOrder ?? 0,
        input.parentId ?? null,
        depth,
        input.isActive === false ? 0 : 1,
        input.showOnline === false ? 0 : 1,
        now,
        id,
        businessId,
      ],
    )
    this.enqueue(id, 'UPSERT', businessId, this.upsertPayload(input, depth), now)
    this.onMutated()
    const updated = this.getOne(id)!
    this.audit?.log({
      action: 'UPDATE',
      entityType: 'product_category',
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
      `SELECT 1 AS n FROM products WHERE category_id = ? AND business_id = ? AND is_deleted = 0 LIMIT 1`,
      [id, businessId],
    )
    if (inUse) {
      throw new Error('This category is still used by one or more products and cannot be deleted.')
    }
    const hasChildren = this.db.get<{ n: number }>(
      `SELECT 1 AS n FROM product_categories WHERE parent_id = ? AND business_id = ? AND is_deleted = 0 LIMIT 1`,
      [id, businessId],
    )
    if (hasChildren) {
      throw new Error('This category has sub-categories and cannot be deleted.')
    }
    this.db.run(
      `UPDATE product_categories SET is_deleted = 1, is_active = 0, updated_at = ? WHERE id = ? AND business_id = ?`,
      [now, id, businessId],
    )
    this.enqueue(id, 'DELETE', businessId, { isDeleted: true }, now)
    this.onMutated()
    this.audit?.log({
      action: 'DELETE',
      entityType: 'product_category',
      entityId: id,
      entityLabel: before?.name ?? null,
      changes: { before, after: null },
    })
  }

  // ---- internals -----------------------------------------------------------

  private getOne(id: string): LocalCategory | null {
    const row = this.db.get<CategoryRow>(
      `SELECT ${SELECT_COLS}
       FROM product_categories WHERE id = ?`,
      [id],
    )
    return row ? toLocalCategory(row) : null
  }

  /** All non-deleted category rows for the active business (for tree/eligibility maths). */
  private allRows(businessId: string): CategoryRow[] {
    return this.db.query<CategoryRow>(
      `SELECT ${SELECT_COLS} FROM product_categories WHERE business_id = ? AND is_deleted = 0`,
      [businessId],
    )
  }

  private brandCategoryIds(businessId: string, brandId: string): string[] {
    return this.db
      .query<{
        category_id: string
      }>(`SELECT category_id FROM brand_categories WHERE business_id = ? AND brand_id = ? AND is_deleted = 0`, [businessId, brandId])
      .map((r) => r.category_id)
  }

  private categoryIdsWithProducts(businessId: string): Set<string> {
    const rows = this.db.query<{ category_id: string }>(
      `SELECT DISTINCT category_id FROM products WHERE business_id = ? AND is_deleted = 0 AND category_id IS NOT NULL`,
      [businessId],
    )
    return new Set(rows.map((r) => r.category_id))
  }

  private categoryIdsWithVariantOptions(businessId: string): Set<string> {
    const rows = this.db.query<{ category_id: string }>(
      `SELECT DISTINCT category_id FROM category_attribute_groups WHERE business_id = ? AND is_deleted = 0`,
      [businessId],
    )
    return new Set(rows.map((r) => r.category_id))
  }

  /** Leaf-descendant ids under each root id (a root that is itself a leaf maps to itself). */
  private leavesUnder(rows: CategoryRow[], rootIds: string[]): Set<string> {
    const childrenOf = new Map<string, CategoryRow[]>()
    for (const r of rows) {
      if (!r.parent_id) continue
      const list = childrenOf.get(r.parent_id) ?? []
      list.push(r)
      childrenOf.set(r.parent_id, list)
    }
    const out = new Set<string>()
    const visit = (id: string, seen: Set<string>): void => {
      if (seen.has(id)) return
      seen.add(id)
      const kids = childrenOf.get(id) ?? []
      if (kids.length === 0) {
        out.add(id)
        return
      }
      for (const k of kids) visit(k.id, seen)
    }
    for (const root of rootIds) visit(root, new Set())
    return out
  }

  /** Throw a descriptive error if `parentId` may not serve as the parent of `selfId`. */
  private assertParentEligible(parentId: string, businessId: string, selfId: string | null): void {
    const rows = this.allRows(businessId)
    const parent = rows.find((r) => r.id === parentId)
    if (!parent) throw new Error('Selected parent category does not exist.')
    if (parent.depth >= 3) {
      throw new Error(
        'Maximum category depth (3 levels) reached — this category cannot be a parent.',
      )
    }
    if (selfId) {
      if (parentId === selfId) throw new Error('A category cannot be its own parent.')
      if (collectDescendants(rows, selfId).has(parentId)) {
        throw new Error('Cannot move a category under one of its own sub-categories.')
      }
    }
    if (this.categoryIdsWithProducts(businessId).has(parentId)) {
      throw new Error('This category already has products and cannot become a parent.')
    }
    if (this.categoryIdsWithVariantOptions(businessId).has(parentId)) {
      throw new Error('This category has variant options and cannot become a parent.')
    }
  }

  private depthFor(parentId: string | null): number {
    if (!parentId) return 1
    const parent = this.db.get<{ depth: number }>(
      'SELECT depth FROM product_categories WHERE id = ?',
      [parentId],
    )
    return (parent?.depth ?? 0) + 1
  }

  private requireBusinessId(): string {
    const businessId = this.getBusinessId()
    if (!businessId) throw new Error('No active business.')
    return businessId
  }

  private upsertPayload(input: CategoryInput, depth: number): Record<string, unknown> {
    return {
      name: input.name.trim(),
      description: input.description?.trim() || null,
      color: input.color ?? null,
      icon: input.icon ?? null,
      imageUrl: input.imageUrl ?? null,
      sortOrder: input.sortOrder ?? 0,
      parentId: input.parentId ?? null,
      depth,
      isActive: input.isActive !== false,
      showOnline: input.showOnline !== false,
    }
  }

  /** Local write + sync_outbox enqueue, coalesced per (entity, record_id). */
  private enqueue(
    recordId: string,
    operation: 'UPSERT' | 'DELETE',
    businessId: string,
    payload: Record<string, unknown>,
    now: string,
  ): void {
    this.db.run(
      `INSERT INTO sync_outbox (id, entity, record_id, operation, payload, status, attempt_count, created_at, updated_at)
       VALUES (?, 'productCategories', ?, ?, ?, 'pending', 0, ?, ?)
       ON CONFLICT(entity, record_id) DO UPDATE SET
         operation = excluded.operation, payload = excluded.payload, status = 'pending',
         attempt_count = 0, next_attempt_at = NULL, last_error = NULL, updated_at = excluded.updated_at`,
      [
        randomUUID(),
        recordId,
        operation,
        JSON.stringify({ id: recordId, businessId, ...payload }),
        now,
        now,
      ],
    )
  }
}

function filterBySearch(rows: CategoryRow[], search?: string): CategoryRow[] {
  const q = search?.trim().toLowerCase()
  if (!q) return rows
  return rows.filter(
    (r) => r.name.toLowerCase().includes(q) || (r.slug ?? '').toLowerCase().includes(q),
  )
}

function sortRows(rows: CategoryRow[]): CategoryRow[] {
  return [...rows].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
}

/** Ids of every category descended from `rootId` (excludes the root itself). */
function collectDescendants(rows: CategoryRow[], rootId: string): Set<string> {
  const childrenOf = new Map<string, CategoryRow[]>()
  for (const r of rows) {
    if (!r.parent_id) continue
    const list = childrenOf.get(r.parent_id) ?? []
    list.push(r)
    childrenOf.set(r.parent_id, list)
  }
  const out = new Set<string>()
  const stack = [rootId]
  while (stack.length) {
    const next = stack.pop()!
    for (const child of childrenOf.get(next) ?? []) {
      if (!out.has(child.id)) {
        out.add(child.id)
        stack.push(child.id)
      }
    }
  }
  return out
}

function toLocalCategory(row: CategoryRow): LocalCategory {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    color: row.color,
    icon: row.icon,
    imageUrl: row.image_url,
    sortOrder: row.sort_order,
    parentId: row.parent_id,
    depth: row.depth,
    isActive: row.is_active === 1,
    showOnline: row.show_online === 1,
  }
}
