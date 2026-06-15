import { randomUUID } from 'crypto'
import type { DatabaseService } from '@biztrack/electron-core'
import type { CategoryInput, LocalCategory } from '../../shared/ipc'

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
  ) {}

  list(): LocalCategory[] {
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

  create(input: CategoryInput): LocalCategory {
    const businessId = this.requireBusinessId()
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
    return this.getOne(id)!
  }

  update(id: string, input: CategoryInput): LocalCategory {
    const businessId = this.requireBusinessId()
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
    return this.getOne(id)!
  }

  remove(id: string): void {
    const businessId = this.requireBusinessId()
    const now = new Date().toISOString()
    this.db.run(
      `UPDATE product_categories SET is_deleted = 1, is_active = 0, updated_at = ? WHERE id = ? AND business_id = ?`,
      [now, id, businessId],
    )
    this.enqueue(id, 'DELETE', businessId, { isDeleted: true }, now)
    this.onMutated()
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
      [randomUUID(), recordId, operation, JSON.stringify({ id: recordId, businessId, ...payload }), now, now],
    )
  }
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
