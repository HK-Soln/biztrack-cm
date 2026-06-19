import { randomUUID } from 'crypto'
import type { DatabaseService } from '@biztrack/electron-core'
import type {
  ContactsQuery,
  CreateContactRequest,
  LocalContact,
  LocalContactListItem,
  PaginatedResult,
  UpdateContactRequest,
} from '../../shared/ipc'
import { paginateRows, toPaginated } from './pagination'
import type { AuditLogger } from './audit.service'

interface ContactRow {
  id: string
  type: string
  name: string
  phone: string | null
  phone_alt: string | null
  address: string | null
  notes: string | null
  is_active: number
  created_at: string
  updated_at: string
}

interface ContactListRow extends ContactRow {
  total_receivable: number
  total_payable: number
  open_debts: number
}

const COLS = 'id, type, name, phone, phone_alt, address, notes, is_active, created_at, updated_at'

// Outstanding per debt = original_amount − settled payments, for live debts only.
// Computed inline so a contact's balances reflect the local debts table (populated
// once supplier payables land). Safe (returns 0) before any debt exists.
const OUTSTANDING = `(d.original_amount - COALESCE((SELECT SUM(dp.amount) FROM debt_payments dp WHERE dp.debt_id = d.id), 0))`
const BALANCE_COLS = `,
  COALESCE((SELECT SUM(${OUTSTANDING}) FROM debts d WHERE d.contact_id = c.id AND d.direction = 'RECEIVABLE' AND d.status IN ('OUTSTANDING','PARTIALLY_PAID')), 0) AS total_receivable,
  COALESCE((SELECT SUM(${OUTSTANDING}) FROM debts d WHERE d.contact_id = c.id AND d.direction = 'PAYABLE' AND d.status IN ('OUTSTANDING','PARTIALLY_PAID')), 0) AS total_payable,
  COALESCE((SELECT COUNT(*) FROM debts d WHERE d.contact_id = c.id AND d.status IN ('OUTSTANDING','PARTIALLY_PAID')), 0) AS open_debts`

/**
 * Offline-first contacts (customers & suppliers). Reads from local SQLite; writes go
 * local + sync_outbox (entity `contacts` → server `contact`) then nudge a sync. Mirrors
 * the API contacts endpoints (GET/POST /contacts, PATCH/DELETE /contacts/:id). Delete is
 * a deactivation (is_active=0), blocked when the contact has open debts — same as the API.
 */
export class ContactsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly getBusinessId: () => string | null,
    private readonly onMutated: () => void,
    private readonly audit?: AuditLogger,
  ) {}

  /** Paginated contacts with outstanding balances. Supports type/isActive filters + search. */
  list(query: ContactsQuery = {}): PaginatedResult<LocalContactListItem> {
    const businessId = this.getBusinessId()
    if (!businessId) return toPaginated<LocalContactListItem>([], { total: 0, page: 1, limit: 20, totalPages: 1 })

    let where = 'c.business_id = ?'
    const params: unknown[] = [businessId]
    if (query.type) {
      where += ' AND c.type = ?'
      params.push(query.type)
    }
    if (query.isActive !== undefined) {
      where += ' AND c.is_active = ?'
      params.push(query.isActive ? 1 : 0)
    }

    const { rows, ...meta } = paginateRows<ContactListRow>(
      this.db,
      {
        from: 'contacts c',
        columns: `c.id, c.type, c.name, c.phone, c.phone_alt, c.address, c.notes, c.is_active, c.created_at, c.updated_at${BALANCE_COLS}`,
        where,
        params,
        searchColumns: ['c.name', 'c.phone', 'c.phone_alt'],
        defaultSort: 'c.name ASC',
        sortMap: { name: 'c.name', createdAt: 'c.created_at' },
      },
      query,
    )
    return toPaginated(rows.map(toListItem), meta)
  }

  /** Active suppliers (type SUPPLIER|BOTH) — for PO/RFQ supplier pickers. */
  listAllSuppliers(): LocalContact[] {
    return this.listAllByTypes(['SUPPLIER', 'BOTH'])
  }

  /** Active customers (type CUSTOMER|BOTH) — for sale/debt pickers. */
  listAllCustomers(): LocalContact[] {
    return this.listAllByTypes(['CUSTOMER', 'BOTH'])
  }

  get(id: string): LocalContactListItem | null {
    const businessId = this.getBusinessId()
    if (!businessId) return null
    const row = this.db.get<ContactListRow>(
      `SELECT c.id, c.type, c.name, c.phone, c.phone_alt, c.address, c.notes, c.is_active, c.created_at, c.updated_at${BALANCE_COLS}
       FROM contacts c WHERE c.id = ? AND c.business_id = ?`,
      [id, businessId],
    )
    return row ? toListItem(row) : null
  }

  create(input: CreateContactRequest): LocalContact {
    const businessId = this.requireBusinessId()
    const name = input.name?.trim()
    if (!name) throw new Error('A contact name is required.')
    const id = randomUUID()
    const now = new Date().toISOString()
    this.db.run(
      `INSERT INTO contacts (id, business_id, type, name, phone, phone_alt, address, notes, is_active, created_by_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, ?, ?)`,
      [id, businessId, input.type, name, clean(input.phone), clean(input.phoneAlt), clean(input.address), clean(input.notes), now, now],
    )
    this.enqueue(id, businessId, this.payload(input.type, name, input, true, now), now)
    this.onMutated()
    const created = this.getOne(id)!
    this.audit?.log({ action: 'CREATE', entityType: 'contact', entityId: id, entityLabel: name, changes: { before: null, after: created } })
    return created
  }

  update(id: string, input: UpdateContactRequest): LocalContact {
    const businessId = this.requireBusinessId()
    const before = this.getOne(id)
    if (!before) throw new Error('Contact not found.')
    const type = input.type ?? (before.type as CreateContactRequest['type'])
    const name = (input.name ?? before.name).trim()
    if (!name) throw new Error('A contact name is required.')
    const phone = input.phone !== undefined ? clean(input.phone) : before.phone
    const phoneAlt = input.phoneAlt !== undefined ? clean(input.phoneAlt) : before.phoneAlt
    const address = input.address !== undefined ? clean(input.address) : before.address
    const notes = input.notes !== undefined ? clean(input.notes) : before.notes
    const now = new Date().toISOString()

    this.db.run(
      `UPDATE contacts SET type = ?, name = ?, phone = ?, phone_alt = ?, address = ?, notes = ?, updated_at = ? WHERE id = ? AND business_id = ?`,
      [type, name, phone, phoneAlt, address, notes, now, id, businessId],
    )
    this.enqueue(id, businessId, { type, name, phone, phoneAlt, address, notes, isActive: before.isActive, createdAt: before.createdAt }, now)
    this.onMutated()
    const updated = this.getOne(id)!
    this.audit?.log({ action: 'UPDATE', entityType: 'contact', entityId: id, entityLabel: name, changes: { before, after: updated } })
    return updated
  }

  /** Deactivate (soft-delete). Blocked when the contact has open debts — matches the API. */
  remove(id: string): void {
    const businessId = this.requireBusinessId()
    const before = this.getOne(id)
    if (!before) throw new Error('Contact not found.')
    const open = this.db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM debts WHERE business_id = ? AND contact_id = ? AND status IN ('OUTSTANDING','PARTIALLY_PAID')`,
      [businessId, id],
    )
    if ((open?.n ?? 0) > 0) throw new Error('This contact has open debts and cannot be removed.')
    const now = new Date().toISOString()
    this.db.run(`UPDATE contacts SET is_active = 0, updated_at = ? WHERE id = ? AND business_id = ?`, [now, id, businessId])
    this.enqueue(id, businessId, { type: before.type, name: before.name, phone: before.phone, phoneAlt: before.phoneAlt, address: before.address, notes: before.notes, isActive: false, createdAt: before.createdAt }, now)
    this.onMutated()
    this.audit?.log({ action: 'DELETE', entityType: 'contact', entityId: id, entityLabel: before.name, changes: { before, after: null } })
  }

  // ---- internals -----------------------------------------------------------

  private listAllByTypes(types: string[]): LocalContact[] {
    const businessId = this.getBusinessId()
    if (!businessId) return []
    const placeholders = types.map(() => '?').join(', ')
    const rows = this.db.query<ContactRow>(
      `SELECT ${COLS} FROM contacts WHERE business_id = ? AND is_active = 1 AND type IN (${placeholders}) ORDER BY name ASC`,
      [businessId, ...types],
    )
    return rows.map(toLocalContact)
  }

  private getOne(id: string): LocalContact | null {
    const row = this.db.get<ContactRow>(`SELECT ${COLS} FROM contacts WHERE id = ?`, [id])
    return row ? toLocalContact(row) : null
  }

  private requireBusinessId(): string {
    const businessId = this.getBusinessId()
    if (!businessId) throw new Error('No active business.')
    return businessId
  }

  private payload(
    type: string,
    name: string,
    input: { phone?: string; phoneAlt?: string; address?: string; notes?: string },
    isActive: boolean,
    createdAt: string,
  ): Record<string, unknown> {
    return { type, name, phone: clean(input.phone), phoneAlt: clean(input.phoneAlt), address: clean(input.address), notes: clean(input.notes), isActive, createdAt }
  }

  /** Local write + sync_outbox enqueue (entity `contacts`), coalesced per record. */
  private enqueue(recordId: string, businessId: string, payload: Record<string, unknown>, now: string): void {
    this.db.run(
      `INSERT INTO sync_outbox (id, entity, record_id, operation, payload, status, attempt_count, created_at, updated_at)
       VALUES (?, 'contacts', ?, 'UPSERT', ?, 'pending', 0, ?, ?)
       ON CONFLICT(entity, record_id) DO UPDATE SET
         operation = excluded.operation, payload = excluded.payload, status = 'pending',
         attempt_count = 0, next_attempt_at = NULL, last_error = NULL, updated_at = excluded.updated_at`,
      [randomUUID(), recordId, JSON.stringify({ id: recordId, businessId, ...payload }), now, now],
    )
  }
}

function clean(v: string | null | undefined): string | null {
  const t = v?.trim()
  return t ? t : null
}

function toLocalContact(row: ContactRow): LocalContact {
  return {
    id: row.id,
    type: row.type as LocalContact['type'],
    name: row.name,
    phone: row.phone,
    phoneAlt: row.phone_alt,
    address: row.address,
    notes: row.notes,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toListItem(row: ContactListRow): LocalContactListItem {
  return {
    ...toLocalContact(row),
    totalReceivable: row.total_receivable ?? 0,
    totalPayable: row.total_payable ?? 0,
    openDebts: row.open_debts ?? 0,
  }
}
