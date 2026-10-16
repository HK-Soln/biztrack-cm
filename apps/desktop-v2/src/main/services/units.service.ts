import { randomUUID } from 'crypto'
import { checkUnitEditable, checkUnitRemoval, decideUnit } from '@biztrack/domain'
import type { DatabaseService } from '@biztrack/electron-core'
import type {
  LocalUnit,
  PaginatedResult,
  UnitInput,
  UnitListQuery,
  UnitType,
} from '../../shared/ipc'
import { paginateRows, toPaginated } from './pagination'
import type { AuditLogger } from './audit.service'

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

const UNIT_REJECTIONS: Record<string, string> = {
  UNIT_OF_MEASURE_NAME_REQUIRED: 'A unit needs a name.',
  UNIT_OF_MEASURE_NAME_TOO_LONG: 'A unit name is at most 50 characters.',
  UNIT_OF_MEASURE_ABBREVIATION_TOO_LONG: 'An abbreviation is at most 10 characters.',
  UNIT_OF_MEASURE_TYPE_INVALID: 'Choose a unit type.',
  UNIT_OF_MEASURE_EXISTS: 'You already have a unit with this name.',
}

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
    private readonly audit?: AuditLogger,
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
    const unit = this.decide(businessId, input)
    this.db.run(
      `INSERT INTO unit_of_measures
        (id, name, abbreviation, business_id, type, is_active, is_deleted, is_default, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
      [
        id,
        unit.name,
        unit.abbreviation,
        businessId,
        unit.type,
        input.isActive === false ? 0 : 1,
        now,
        now,
      ],
    )
    this.enqueue(id, 'UPSERT', businessId, this.payload(unit, input), now)
    this.onMutated()
    const created = this.getOne(id)!
    this.audit?.log({
      action: 'CREATE',
      entityType: 'unit_of_measure',
      entityId: id,
      entityLabel: created.name,
      changes: { before: null, after: created },
    })
    return created
  }

  update(id: string, input: UnitInput): LocalUnit {
    const businessId = this.requireBusinessId()
    this.requireOwnedUnit(id, businessId)
    const now = new Date().toISOString()
    const unit = this.decide(businessId, input, id)
    this.db.run(
      `UPDATE unit_of_measures
       SET name = ?, abbreviation = ?, type = ?, is_active = ?, updated_at = ?
       WHERE id = ? AND business_id = ?`,
      [
        unit.name,
        unit.abbreviation,
        unit.type,
        input.isActive === false ? 0 : 1,
        now,
        id,
        businessId,
      ],
    )
    this.enqueue(id, 'UPSERT', businessId, this.payload(unit, input), now)
    this.onMutated()
    const updated = this.getOne(id)!
    this.audit?.log({
      action: 'UPDATE',
      entityType: 'unit_of_measure',
      entityId: id,
      entityLabel: updated.name,
      changes: { before: null, after: updated },
    })
    return updated
  }

  remove(id: string): void {
    const businessId = this.requireBusinessId()
    this.requireOwnedUnit(id, businessId)
    const now = new Date().toISOString()
    const before = this.getOne(id)
    const inUse = this.db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM products WHERE unit_of_measure_id = ? AND business_id = ? AND is_deleted = 0`,
      [id, businessId],
    )
    if (checkUnitRemoval(inUse?.n ?? 0)) {
      throw new Error('This unit is still used by one or more products and cannot be deleted.')
    }
    this.db.run(
      `UPDATE unit_of_measures SET is_deleted = 1, is_active = 0, updated_at = ? WHERE id = ? AND business_id = ?`,
      [now, id, businessId],
    )
    this.enqueue(id, 'DELETE', businessId, { isDeleted: true }, now)
    this.onMutated()
    this.audit?.log({
      action: 'DELETE',
      entityType: 'unit_of_measure',
      entityId: id,
      entityLabel: before?.name ?? null,
      changes: { before, after: null },
    })
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
    if (row.business_id !== null && row.business_id !== businessId)
      throw new Error('Unit not found.')
    if (checkUnitEditable({ businessId: row.business_id, isDefault: row.is_default === 1 })) {
      throw new Error('System units cannot be modified.')
    }
    return row
  }

  private requireBusinessId(): string {
    const businessId = this.getBusinessId()
    if (!businessId) throw new Error('No active business.')
    return businessId
  }

  /**
   * The unit as @biztrack/domain stores it (R12), checked against the business's other
   * units, deleted ones included, as the server checks them.
   */
  private decide(
    businessId: string,
    input: UnitInput,
    selfId?: string,
  ): { name: string; abbreviation: string; type: UnitType } {
    const others = this.db.query<{ name: string }>(
      `SELECT name FROM unit_of_measures WHERE business_id = ? AND id <> ?`,
      [businessId, selfId ?? ''],
    )
    const decision = decideUnit({
      name: input.name,
      abbreviation: input.abbreviation,
      type: input.type ?? 'CUSTOM',
      takenNames: others.map((u) => u.name),
    })
    if (!decision.ok) throw new Error(UNIT_REJECTIONS[decision.code] ?? 'This unit is not valid.')
    return { name: decision.name, abbreviation: decision.abbreviation, type: decision.type }
  }

  private payload(
    unit: { name: string; abbreviation: string; type: UnitType },
    input: UnitInput,
  ): Record<string, unknown> {
    return { ...unit, isDefault: false, isActive: input.isActive !== false }
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
