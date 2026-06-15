import { randomUUID } from 'crypto'
import type { DatabaseService } from '@biztrack/electron-core'
import type { LocalUnit, PaginatedResult, UnitInput, UnitListQuery, UnitType } from '../../shared/ipc'
import { paginateRows, toPaginated } from './pagination'

interface UnitRow {
  id: string
  name: string
  abbreviation: string | null
  business_id: string | null
  type: string | null
  is_default: number
  is_active: number
}

const UNIT_TYPES: UnitType[] = ['QUANTITY', 'WEIGHT', 'VOLUME', 'LENGTH', 'CUSTOM']
function normalizeType(value: string | null | undefined): UnitType {
  const upper = (value ?? '').toUpperCase() as UnitType
  return UNIT_TYPES.includes(upper) ? upper : 'CUSTOM'
}

/**
 * Offline-first units of measure. Reads return both system units (business_id NULL,
 * pulled, read-only) and this business's own units. Writes go to local SQLite + the
 * sync_outbox, then nudge a sync. System/default units cannot be edited or deleted —
 * the API rejects those, so we guard here too. Business scope from the session.
 */
export class UnitsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly getBusinessId: () => string | null,
    private readonly onMutated: () => void,
  ) {}

  /** Paginated list (system + business units), default 20, with search + type filter. */
  list(query: UnitListQuery = {}): PaginatedResult<LocalUnit> {
    const businessId = this.getBusinessId()
    let where = 'is_deleted = 0 AND (business_id IS NULL OR business_id = ?)'
    const params: unknown[] = [businessId]
    if (query.type) {
      where += ' AND type = ?'
      params.push(query.type.toUpperCase())
    }

    const { rows, ...meta } = paginateRows<UnitRow>(
      this.db,
      {
        from: 'unit_of_measures',
        columns: 'id, name, abbreviation, business_id, type, is_default, is_active',
        where,
        params,
        searchColumns: ['name', 'abbreviation'],
        defaultSort: 'is_default DESC, name ASC',
        sortMap: { name: 'name', type: 'type' },
      },
      query,
    )
    return toPaginated(rows.map(toLocalUnit), meta)
  }

  create(input: UnitInput): LocalUnit {
    const businessId = this.requireBusinessId()
    const id = randomUUID()
    const now = new Date().toISOString()
    const type = normalizeType(input.type)
    this.db.run(
      `INSERT INTO unit_of_measures
        (id, name, abbreviation, business_id, type, is_active, is_deleted, is_default, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
      [id, input.name.trim().toUpperCase(), input.abbreviation.trim(), businessId, type, input.isActive === false ? 0 : 1, now, now],
    )
    this.enqueue(id, 'UPSERT', businessId, this.payload(input, type), now)
    this.onMutated()
    return this.getOne(id)!
  }

  update(id: string, input: UnitInput): LocalUnit {
    const businessId = this.requireBusinessId()
    const existing = this.requireOwnedUnit(id, businessId)
    const now = new Date().toISOString()
    const type = normalizeType(input.type)
    this.db.run(
      `UPDATE unit_of_measures
       SET name = ?, abbreviation = ?, type = ?, is_active = ?, updated_at = ?
       WHERE id = ? AND business_id = ?`,
      [input.name.trim().toUpperCase(), input.abbreviation.trim(), type, input.isActive === false ? 0 : 1, now, id, businessId],
    )
    this.enqueue(id, 'UPSERT', businessId, this.payload(input, type, existing.is_default === 1), now)
    this.onMutated()
    return this.getOne(id)!
  }

  remove(id: string): void {
    const businessId = this.requireBusinessId()
    this.requireOwnedUnit(id, businessId)
    const now = new Date().toISOString()
    this.db.run(
      `UPDATE unit_of_measures SET is_deleted = 1, is_active = 0, updated_at = ? WHERE id = ? AND business_id = ?`,
      [now, id, businessId],
    )
    this.enqueue(id, 'DELETE', businessId, { isDeleted: true }, now)
    this.onMutated()
  }

  // ---- internals -----------------------------------------------------------

  private getOne(id: string): LocalUnit | null {
    const row = this.db.get<UnitRow>(
      `SELECT id, name, abbreviation, business_id, type, is_default, is_active FROM unit_of_measures WHERE id = ?`,
      [id],
    )
    return row ? toLocalUnit(row) : null
  }

  /** System (NULL-business) and other businesses' units are not editable here. */
  private requireOwnedUnit(id: string, businessId: string): UnitRow {
    const row = this.db.get<UnitRow>(
      `SELECT id, name, abbreviation, business_id, type, is_default, is_active FROM unit_of_measures WHERE id = ?`,
      [id],
    )
    if (!row) throw new Error('Unit not found.')
    if (row.business_id !== businessId) throw new Error('System units cannot be modified.')
    return row
  }

  private requireBusinessId(): string {
    const businessId = this.getBusinessId()
    if (!businessId) throw new Error('No active business.')
    return businessId
  }

  private payload(input: UnitInput, type: UnitType, isDefault = false): Record<string, unknown> {
    return {
      name: input.name.trim().toUpperCase(),
      abbreviation: input.abbreviation.trim(),
      type,
      isDefault,
      isActive: input.isActive !== false,
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
       VALUES (?, 'unitOfMeasures', ?, ?, ?, 'pending', 0, ?, ?)
       ON CONFLICT(entity, record_id) DO UPDATE SET
         operation = excluded.operation, payload = excluded.payload, status = 'pending',
         attempt_count = 0, next_attempt_at = NULL, last_error = NULL, updated_at = excluded.updated_at`,
      [randomUUID(), recordId, operation, JSON.stringify({ id: recordId, businessId, ...payload }), now, now],
    )
  }
}

function toLocalUnit(row: UnitRow): LocalUnit {
  return {
    id: row.id,
    name: row.name,
    abbreviation: row.abbreviation,
    type: normalizeType(row.type),
    isDefault: row.is_default === 1,
    isActive: row.is_active === 1,
    isSystem: row.business_id === null,
  }
}
