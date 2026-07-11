import { randomUUID } from 'crypto'
import type { DatabaseService } from '@biztrack/electron-core'
import type {
  AttributeDisplayType,
  AttributeGroupInput,
  AttributeGroupListQuery,
  AttributeOptionInput,
  CategoryAttributeLinkInput,
  LocalAttributeGroup,
  LocalAttributeOption,
  LocalCategoryAttributeGroup,
  PaginatedResult,
} from '../../shared/ipc'
import { paginateRows, toPaginated } from './pagination'
import type { AuditLogger } from './audit.service'

interface GroupRow {
  id: string
  name: string
  display_type: string
  sort_order: number
  is_active: number
}

interface OptionRow {
  id: string
  group_id: string
  value: string
  color_hex: string | null
  sort_order: number
  is_active: number
}

interface LinkRow {
  id: string
  category_id: string
  attribute_group_id: string
  is_required: number
  sort_order: number
}

const DISPLAY_TYPES: AttributeDisplayType[] = ['CHIPS', 'SWATCHES', 'DROPDOWN']
function normalizeDisplayType(value: string | undefined): AttributeDisplayType {
  const upper = (value ?? '').toUpperCase() as AttributeDisplayType
  return DISPLAY_TYPES.includes(upper) ? upper : 'CHIPS'
}

/**
 * Offline-first product attributes (groups, options, category links). Reads come from
 * local SQLite (synced via pull); writes go to local SQLite + sync_outbox in one step,
 * then nudge a sync. Outbox entity names match the server SyncEntity mapping
 * (attributeGroups / attributeOptions / categoryAttributeGroups). Business scope is
 * resolved from the active session — never passed by the renderer.
 */
export class AttributesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly getBusinessId: () => string | null,
    private readonly onMutated: () => void,
    private readonly audit?: AuditLogger,
  ) {}

  // ---- groups + options ----------------------------------------------------

  /** Paginated groups (default 20) with search, each hydrated with options + usage count. */
  listGroups(query: AttributeGroupListQuery = {}): PaginatedResult<LocalAttributeGroup> {
    const businessId = this.getBusinessId()
    if (!businessId)
      return toPaginated<LocalAttributeGroup>([], { total: 0, page: 1, limit: 20, totalPages: 1 })
    const { rows, ...meta } = paginateRows<GroupRow>(
      this.db,
      {
        from: 'attribute_groups',
        columns: 'id, name, display_type, sort_order, is_active',
        where: 'business_id = ? AND is_deleted = 0',
        params: [businessId],
        searchColumns: ['name'],
        defaultSort: 'sort_order ASC, name ASC',
        sortMap: { name: 'name', sortOrder: 'sort_order' },
      },
      query,
    )
    return toPaginated(this.hydrateGroups(businessId, rows), meta)
  }

  /** Full set (no pagination) — for the category form's attribute attach list. */
  listAllGroups(): LocalAttributeGroup[] {
    const businessId = this.getBusinessId()
    if (!businessId) return []
    const groups = this.db.query<GroupRow>(
      `SELECT id, name, display_type, sort_order, is_active
       FROM attribute_groups
       WHERE business_id = ? AND is_deleted = 0
       ORDER BY sort_order ASC, name ASC`,
      [businessId],
    )
    return this.hydrateGroups(businessId, groups)
  }

  /** Attach options + category-usage counts to a set of group rows. */
  private hydrateGroups(businessId: string, groups: GroupRow[]): LocalAttributeGroup[] {
    if (groups.length === 0) return []
    const groupIds = groups.map((g) => g.id)
    const placeholders = groupIds.map(() => '?').join(', ')
    const options = this.db.query<OptionRow>(
      `SELECT id, group_id, value, color_hex, sort_order, is_active
       FROM attribute_options
       WHERE business_id = ? AND is_deleted = 0 AND group_id IN (${placeholders})
       ORDER BY sort_order ASC, value ASC`,
      [businessId, ...groupIds],
    )
    const counts = this.db.query<{ attribute_group_id: string; n: number }>(
      `SELECT attribute_group_id, COUNT(*) AS n
       FROM category_attribute_groups
       WHERE business_id = ? AND is_deleted = 0 AND attribute_group_id IN (${placeholders})
       GROUP BY attribute_group_id`,
      [businessId, ...groupIds],
    )
    const countByGroup = new Map(counts.map((c) => [c.attribute_group_id, c.n]))
    const optionsByGroup = new Map<string, LocalAttributeOption[]>()
    for (const o of options) {
      const list = optionsByGroup.get(o.group_id) ?? []
      list.push(toOption(o))
      optionsByGroup.set(o.group_id, list)
    }
    return groups.map((g) => ({
      id: g.id,
      name: g.name,
      displayType: normalizeDisplayType(g.display_type),
      sortOrder: g.sort_order,
      isActive: g.is_active === 1,
      categoryCount: countByGroup.get(g.id) ?? 0,
      options: optionsByGroup.get(g.id) ?? [],
    }))
  }

  createGroup(input: AttributeGroupInput): LocalAttributeGroup {
    const businessId = this.requireBusinessId()
    this.assertGroupNameAvailable(businessId, input.name)
    const id = randomUUID()
    const now = new Date().toISOString()
    const sortOrder = input.sortOrder ?? this.nextGroupOrder(businessId)
    const displayType = normalizeDisplayType(input.displayType)
    this.db.run(
      `INSERT INTO attribute_groups
        (id, business_id, name, display_type, sort_order, is_active, is_deleted, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        id,
        businessId,
        input.name.trim(),
        displayType,
        sortOrder,
        input.isActive === false ? 0 : 1,
        now,
        now,
      ],
    )
    this.enqueue(
      'attributeGroups',
      id,
      'UPSERT',
      businessId,
      this.groupPayload(input, displayType, sortOrder),
      now,
    )
    this.onMutated()
    const created = this.getGroup(id)!
    this.audit?.log({
      action: 'CREATE',
      entityType: 'attribute_group',
      entityId: id,
      entityLabel: created.name,
      changes: { before: null, after: created },
    })
    return created
  }

  updateGroup(id: string, input: AttributeGroupInput): LocalAttributeGroup {
    const businessId = this.requireBusinessId()
    const now = new Date().toISOString()
    const existing = this.db.get<GroupRow>(
      `SELECT id, name, display_type, sort_order, is_active FROM attribute_groups WHERE id = ? AND business_id = ?`,
      [id, businessId],
    )
    if (!existing) throw new Error('Attribute group not found.')
    if (input.name && input.name.trim().toLowerCase() !== existing.name.toLowerCase()) {
      this.assertGroupNameAvailable(businessId, input.name, id)
    }
    const displayType = normalizeDisplayType(input.displayType ?? existing.display_type)
    const sortOrder = input.sortOrder ?? existing.sort_order
    this.db.run(
      `UPDATE attribute_groups
       SET name = ?, display_type = ?, sort_order = ?, is_active = ?, updated_at = ?
       WHERE id = ? AND business_id = ?`,
      [
        input.name.trim(),
        displayType,
        sortOrder,
        input.isActive === false ? 0 : 1,
        now,
        id,
        businessId,
      ],
    )
    this.enqueue(
      'attributeGroups',
      id,
      'UPSERT',
      businessId,
      this.groupPayload(input, displayType, sortOrder),
      now,
    )
    this.onMutated()
    const updated = this.getGroup(id)!
    this.audit?.log({
      action: 'UPDATE',
      entityType: 'attribute_group',
      entityId: id,
      entityLabel: updated.name,
      changes: { before: null, after: updated },
    })
    return updated
  }

  deleteGroup(id: string): void {
    const businessId = this.requireBusinessId()
    const now = new Date().toISOString()
    const before = this.getGroup(id)
    const variantUse = this.db.get<{ n: number }>(
      `SELECT 1 AS n FROM product_variant_options pvo
         JOIN product_variants pv ON pv.id = pvo.variant_id
         JOIN products p ON p.id = pv.product_id
       WHERE pvo.attribute_group_id = ? AND pvo.business_id = ?
         AND pvo.is_deleted = 0 AND pv.is_deleted = 0 AND p.is_deleted = 0
       LIMIT 1`,
      [id, businessId],
    )
    if (variantUse) {
      throw new Error(
        'This attribute is still used by one or more product variants and cannot be deleted.',
      )
    }
    const linked = this.db.get<{ n: number }>(
      `SELECT 1 AS n FROM category_attribute_groups WHERE attribute_group_id = ? AND business_id = ? AND is_deleted = 0 LIMIT 1`,
      [id, businessId],
    )
    if (linked) {
      throw new Error('This attribute is linked to one or more categories and cannot be deleted.')
    }
    this.db.run(
      `UPDATE attribute_groups SET is_deleted = 1, is_active = 0, updated_at = ? WHERE id = ? AND business_id = ?`,
      [now, id, businessId],
    )
    this.enqueue('attributeGroups', id, 'DELETE', businessId, { isDeleted: true }, now)
    this.onMutated()
    this.audit?.log({
      action: 'DELETE',
      entityType: 'attribute_group',
      entityId: id,
      entityLabel: before?.name ?? null,
      changes: { before, after: null },
    })
  }

  addOption(groupId: string, input: AttributeOptionInput): LocalAttributeOption {
    const businessId = this.requireBusinessId()
    this.assertOptionValueAvailable(groupId, businessId, input.value)
    const id = randomUUID()
    const now = new Date().toISOString()
    const sortOrder = input.sortOrder ?? this.nextOptionOrder(businessId, groupId)
    this.db.run(
      `INSERT INTO attribute_options
        (id, group_id, business_id, value, color_hex, sort_order, is_active, is_deleted, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        id,
        groupId,
        businessId,
        input.value.trim(),
        input.colorHex ?? null,
        sortOrder,
        input.isActive === false ? 0 : 1,
        now,
        now,
      ],
    )
    this.enqueue(
      'attributeOptions',
      id,
      'UPSERT',
      businessId,
      this.optionPayload(groupId, input, sortOrder),
      now,
    )
    this.onMutated()
    const created = this.getOption(id)!
    this.audit?.log({
      action: 'CREATE',
      entityType: 'attribute_option',
      entityId: id,
      entityLabel: created.value,
      changes: { before: null, after: created },
    })
    return created
  }

  updateOption(optionId: string, input: AttributeOptionInput): LocalAttributeOption {
    const businessId = this.requireBusinessId()
    const now = new Date().toISOString()
    const existing = this.db.get<OptionRow>(
      `SELECT id, group_id, value, color_hex, sort_order, is_active FROM attribute_options WHERE id = ? AND business_id = ?`,
      [optionId, businessId],
    )
    if (!existing) throw new Error('Attribute option not found.')
    if (input.value && input.value.trim().toLowerCase() !== existing.value.toLowerCase()) {
      this.assertOptionValueAvailable(existing.group_id, businessId, input.value, optionId)
    }
    const sortOrder = input.sortOrder ?? existing.sort_order
    this.db.run(
      `UPDATE attribute_options
       SET value = ?, color_hex = ?, sort_order = ?, is_active = ?, updated_at = ?
       WHERE id = ? AND business_id = ?`,
      [
        input.value.trim(),
        input.colorHex ?? null,
        sortOrder,
        input.isActive === false ? 0 : 1,
        now,
        optionId,
        businessId,
      ],
    )
    this.enqueue(
      'attributeOptions',
      optionId,
      'UPSERT',
      businessId,
      this.optionPayload(existing.group_id, input, sortOrder),
      now,
    )
    this.onMutated()
    const updated = this.getOption(optionId)!
    this.audit?.log({
      action: 'UPDATE',
      entityType: 'attribute_option',
      entityId: optionId,
      entityLabel: updated.value,
      changes: { before: null, after: updated },
    })
    return updated
  }

  deleteOption(optionId: string): void {
    const businessId = this.requireBusinessId()
    const now = new Date().toISOString()
    const before = this.getOption(optionId)
    const inUse = this.db.get<{ n: number }>(
      `SELECT 1 AS n FROM product_variant_options pvo
         JOIN product_variants pv ON pv.id = pvo.variant_id
         JOIN products p ON p.id = pv.product_id
       WHERE pvo.attribute_option_id = ? AND pvo.business_id = ?
         AND pvo.is_deleted = 0 AND pv.is_deleted = 0 AND p.is_deleted = 0
       LIMIT 1`,
      [optionId, businessId],
    )
    if (inUse) {
      throw new Error(
        'This option is still used by one or more product variants and cannot be deleted.',
      )
    }
    this.db.run(
      `UPDATE attribute_options SET is_deleted = 1, is_active = 0, updated_at = ? WHERE id = ? AND business_id = ?`,
      [now, optionId, businessId],
    )
    this.enqueue('attributeOptions', optionId, 'DELETE', businessId, { isDeleted: true }, now)
    this.onMutated()
    this.audit?.log({
      action: 'DELETE',
      entityType: 'attribute_option',
      entityId: optionId,
      entityLabel: before?.value ?? null,
      changes: { before, after: null },
    })
  }

  // ---- category links ------------------------------------------------------

  listCategoryLinks(categoryId: string): LocalCategoryAttributeGroup[] {
    const businessId = this.getBusinessId()
    if (!businessId) return []
    const links = this.db.query<LinkRow>(
      `SELECT id, category_id, attribute_group_id, is_required, sort_order
       FROM category_attribute_groups
       WHERE business_id = ? AND category_id = ? AND is_deleted = 0
       ORDER BY sort_order ASC`,
      [businessId, categoryId],
    )
    if (links.length === 0) return []
    const groups = new Map(this.listAllGroups().map((g) => [g.id, g]))
    return links
      .map((l) => {
        const group = groups.get(l.attribute_group_id)
        if (!group) return null
        return {
          id: l.id,
          categoryId: l.category_id,
          attributeGroupId: l.attribute_group_id,
          isRequired: l.is_required === 1,
          sortOrder: l.sort_order,
          name: group.name,
          displayType: group.displayType,
          options: group.options.map((o) => ({ id: o.id, value: o.value, colorHex: o.colorHex })),
        } satisfies LocalCategoryAttributeGroup
      })
      .filter((x): x is LocalCategoryAttributeGroup => x !== null)
  }

  /** Replace a category's attachments with `links`: upsert desired, soft-delete removed. */
  setCategoryLinks(categoryId: string, links: CategoryAttributeLinkInput[]): void {
    const businessId = this.requireBusinessId()
    const now = new Date().toISOString()
    const existing = this.db.query<LinkRow>(
      `SELECT id, category_id, attribute_group_id, is_required, sort_order
       FROM category_attribute_groups
       WHERE business_id = ? AND category_id = ? AND is_deleted = 0`,
      [businessId, categoryId],
    )
    const existingByGroup = new Map(existing.map((l) => [l.attribute_group_id, l]))
    const desiredGroupIds = new Set(links.map((l) => l.attributeGroupId))

    links.forEach((link, index) => {
      const isRequired = link.isRequired !== false
      const sortOrder = link.sortOrder ?? index
      const prior = existingByGroup.get(link.attributeGroupId)
      const id = prior?.id ?? randomUUID()
      if (prior) {
        this.db.run(
          `UPDATE category_attribute_groups SET is_required = ?, sort_order = ?, updated_at = ? WHERE id = ?`,
          [isRequired ? 1 : 0, sortOrder, now, id],
        )
      } else {
        this.db.run(
          `INSERT INTO category_attribute_groups
            (id, business_id, category_id, attribute_group_id, is_required, sort_order, is_deleted, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
          [
            id,
            businessId,
            categoryId,
            link.attributeGroupId,
            isRequired ? 1 : 0,
            sortOrder,
            now,
            now,
          ],
        )
      }
      this.enqueue(
        'categoryAttributeGroups',
        id,
        'UPSERT',
        businessId,
        { categoryId, attributeGroupId: link.attributeGroupId, isRequired, sortOrder },
        now,
      )
    })

    for (const prior of existing) {
      if (desiredGroupIds.has(prior.attribute_group_id)) continue
      this.db.run(
        `UPDATE category_attribute_groups SET is_deleted = 1, updated_at = ? WHERE id = ?`,
        [now, prior.id],
      )
      this.enqueue(
        'categoryAttributeGroups',
        prior.id,
        'DELETE',
        businessId,
        { isDeleted: true },
        now,
      )
    }

    this.onMutated()
  }

  // ---- internals -----------------------------------------------------------

  private getGroup(id: string): LocalAttributeGroup | null {
    return this.listAllGroups().find((g) => g.id === id) ?? null
  }

  private getOption(id: string): LocalAttributeOption | null {
    const row = this.db.get<OptionRow>(
      `SELECT id, group_id, value, color_hex, sort_order, is_active FROM attribute_options WHERE id = ?`,
      [id],
    )
    return row ? toOption(row) : null
  }

  /** Group names are unique per business, case-insensitively, among non-deleted groups. */
  private assertGroupNameAvailable(businessId: string, name: string, excludeId?: string): void {
    const params: unknown[] = [businessId, name.trim()]
    let sql = `SELECT 1 AS n FROM attribute_groups
               WHERE business_id = ? AND is_deleted = 0 AND LOWER(name) = LOWER(?)`
    if (excludeId) {
      sql += ' AND id != ?'
      params.push(excludeId)
    }
    if (this.db.get(sql + ' LIMIT 1', params)) {
      throw new Error('An attribute with this name already exists.')
    }
  }

  /** Option values are unique per group, case-insensitively, among non-deleted options. */
  private assertOptionValueAvailable(
    groupId: string,
    businessId: string,
    value: string,
    excludeId?: string,
  ): void {
    const params: unknown[] = [groupId, businessId, value.trim()]
    let sql = `SELECT 1 AS n FROM attribute_options
               WHERE group_id = ? AND business_id = ? AND is_deleted = 0 AND LOWER(value) = LOWER(?)`
    if (excludeId) {
      sql += ' AND id != ?'
      params.push(excludeId)
    }
    if (this.db.get(sql + ' LIMIT 1', params)) {
      throw new Error('An option with this value already exists in this attribute.')
    }
  }

  private nextGroupOrder(businessId: string): number {
    const row = this.db.get<{ n: number | null }>(
      `SELECT MAX(sort_order) AS n FROM attribute_groups WHERE business_id = ? AND is_deleted = 0`,
      [businessId],
    )
    return (row?.n ?? -1) + 1
  }

  private nextOptionOrder(businessId: string, groupId: string): number {
    const row = this.db.get<{ n: number | null }>(
      `SELECT MAX(sort_order) AS n FROM attribute_options WHERE business_id = ? AND group_id = ? AND is_deleted = 0`,
      [businessId, groupId],
    )
    return (row?.n ?? -1) + 1
  }

  private requireBusinessId(): string {
    const businessId = this.getBusinessId()
    if (!businessId) throw new Error('No active business.')
    return businessId
  }

  private groupPayload(
    input: AttributeGroupInput,
    displayType: AttributeDisplayType,
    sortOrder: number,
  ): Record<string, unknown> {
    return { name: input.name.trim(), displayType, sortOrder, isActive: input.isActive !== false }
  }

  private optionPayload(
    groupId: string,
    input: AttributeOptionInput,
    sortOrder: number,
  ): Record<string, unknown> {
    return {
      groupId,
      value: input.value.trim(),
      colorHex: input.colorHex ?? null,
      sortOrder,
      isActive: input.isActive !== false,
    }
  }

  /** Local write + sync_outbox enqueue, coalesced per (entity, record_id). */
  private enqueue(
    entity: 'attributeGroups' | 'attributeOptions' | 'categoryAttributeGroups',
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

function toOption(row: OptionRow): LocalAttributeOption {
  return {
    id: row.id,
    groupId: row.group_id,
    value: row.value,
    colorHex: row.color_hex,
    sortOrder: row.sort_order,
    isActive: row.is_active === 1,
  }
}
