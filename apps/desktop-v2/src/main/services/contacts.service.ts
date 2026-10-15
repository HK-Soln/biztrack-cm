import {
  checkContactInput,
  contactNameKey,
  findContactClashes,
  mergeContact,
  normalizeEmail,
  normalizePhone,
  type ContactDuplicate,
} from '@biztrack/domain'
import { randomUUID } from 'crypto'
import type { DatabaseService } from '@biztrack/electron-core'
import type {
  ContactsQuery,
  ContactsSummary,
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
  email: string | null
  address: string | null
  notes: string | null
  id_type: string | null
  id_number: string | null
  id_issue_date: string | null
  id_expiry_date: string | null
  id_documents: string | null
  selfie_url: string | null
  is_active: number
  created_at: string
  updated_at: string
}

interface ContactListRow extends ContactRow {
  total_receivable: number
  total_payable: number
  open_debts: number
  oldest_unpaid: string | null
}

const COLS =
  'id, type, name, phone, phone_alt, email, address, notes, id_type, id_number, id_issue_date, id_expiry_date, id_documents, selfie_url, is_active, created_at, updated_at'
const C_COLS = COLS.split(', ')
  .map((c) => `c.${c}`)
  .join(', ')

// Outstanding per debt = original_amount − settled payments, for live debts only.
// Computed inline so a contact's balances reflect the local debts table (populated
// once supplier payables land). Safe (returns 0) before any debt exists.
const OUTSTANDING = `(d.original_amount - COALESCE((SELECT SUM(dp.amount) FROM debt_payments dp WHERE dp.debt_id = d.id), 0))`
// A contact's outstanding balance = the sum of live debts. The opening balance is itself an
// OPENING_BALANCE debt now (see [[opening-balance-as-debt]]), so it is already in this SUM —
// do NOT add contact_opening_balances on top or it double-counts.
const BALANCE_COLS = `,
  COALESCE((SELECT SUM(${OUTSTANDING}) FROM debts d WHERE d.contact_id = c.id AND d.direction = 'RECEIVABLE' AND d.status IN ('OUTSTANDING','PARTIALLY_PAID')), 0) AS total_receivable,
  COALESCE((SELECT SUM(${OUTSTANDING}) FROM debts d WHERE d.contact_id = c.id AND d.direction = 'PAYABLE' AND d.status IN ('OUTSTANDING','PARTIALLY_PAID')), 0) AS total_payable,
  COALESCE((SELECT COUNT(*) FROM debts d WHERE d.contact_id = c.id AND d.status IN ('OUTSTANDING','PARTIALLY_PAID')), 0) AS open_debts,
  (SELECT MIN(d.created_at) FROM debts d WHERE d.contact_id = c.id AND d.status IN ('OUTSTANDING','PARTIALLY_PAID')) AS oldest_unpaid`

/**
 * Offline-first contacts (customers & suppliers). Reads from local SQLite; writes go
 * local + sync_outbox (entity `contacts` → server `contact`) then nudge a sync. Mirrors
 * the API contacts endpoints (GET/POST /contacts, PATCH/DELETE /contacts/:id). Delete is
 * a deactivation (is_active=0), blocked when the contact has open debts — same as the API.
 */
const NAME_TAKEN_MESSAGE = 'Another contact already has this name.'

/**
 * CONTACT_DUPLICATE as it crosses to the screen: the code and the contact it matched travel
 * in the message (Electron passes only the message), read back by contact-duplicate.ts.
 */
function contactDuplicateError(duplicate: ContactDuplicate): Error {
  return new Error(`CONTACT_DUPLICATE ${JSON.stringify(duplicate)}`)
}

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
    if (!businessId)
      return toPaginated<LocalContactListItem>([], { total: 0, page: 1, limit: 20, totalPages: 1 })

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
    if (query.balance === 'debtor' || query.balance === 'creditor') {
      const dir = query.balance === 'debtor' ? 'RECEIVABLE' : 'PAYABLE'
      where += ` AND EXISTS (SELECT 1 FROM debts d WHERE d.contact_id = c.id AND d.direction = '${dir}' AND d.status IN ('OUTSTANDING','PARTIALLY_PAID'))`
    }

    const { rows, ...meta } = paginateRows<ContactListRow>(
      this.db,
      {
        from: 'contacts c',
        columns: `${C_COLS}${BALANCE_COLS}`,
        where,
        params,
        searchColumns: ['c.name', 'c.phone', 'c.phone_alt', 'c.email'],
        defaultSort: 'c.name ASC',
        sortMap: {
          name: 'c.name',
          createdAt: 'c.created_at',
          balance: '(total_receivable + total_payable)',
        },
      },
      query,
    )
    return toPaginated(rows.map(toListItem), meta)
  }

  /** Aggregate balances + per-tab counts for the list header. */
  summary(): ContactsSummary {
    const empty: ContactsSummary = {
      totalReceivable: 0,
      totalPayable: 0,
      allCount: 0,
      customerCount: 0,
      supplierCount: 0,
      debtorCount: 0,
      creditorCount: 0,
    }
    const businessId = this.getBusinessId()
    if (!businessId) return empty
    const live = "status IN ('OUTSTANDING','PARTIALLY_PAID')"
    const row = this.db.get<{
      tr: number
      tp: number
      ac: number
      cc: number
      sc: number
      dc: number
      cr: number
    }>(
      `SELECT
         (SELECT COALESCE(SUM(${OUTSTANDING}), 0) FROM debts d WHERE d.business_id = ? AND d.direction = 'RECEIVABLE' AND ${live}) AS tr,
         (SELECT COALESCE(SUM(${OUTSTANDING}), 0) FROM debts d WHERE d.business_id = ? AND d.direction = 'PAYABLE' AND ${live}) AS tp,
         (SELECT COUNT(*) FROM contacts WHERE business_id = ? AND is_active = 1) AS ac,
         (SELECT COUNT(*) FROM contacts WHERE business_id = ? AND is_active = 1 AND type IN ('CUSTOMER','BOTH')) AS cc,
         (SELECT COUNT(*) FROM contacts WHERE business_id = ? AND is_active = 1 AND type IN ('SUPPLIER','BOTH')) AS sc,
         (SELECT COUNT(DISTINCT d.contact_id) FROM debts d WHERE d.business_id = ? AND d.direction = 'RECEIVABLE' AND ${live}) AS dc,
         (SELECT COUNT(DISTINCT d.contact_id) FROM debts d WHERE d.business_id = ? AND d.direction = 'PAYABLE' AND ${live}) AS cr`,
      [businessId, businessId, businessId, businessId, businessId, businessId, businessId],
    )
    if (!row) return empty
    return {
      totalReceivable: row.tr ?? 0,
      totalPayable: row.tp ?? 0,
      allCount: row.ac ?? 0,
      customerCount: row.cc ?? 0,
      supplierCount: row.sc ?? 0,
      debtorCount: row.dc ?? 0,
      creditorCount: row.cr ?? 0,
    }
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
      `SELECT ${C_COLS}${BALANCE_COLS}
       FROM contacts c WHERE c.id = ? AND c.business_id = ?`,
      [id, businessId],
    )
    return row ? toListItem(row) : null
  }

  create(input: CreateContactRequest): LocalContact {
    const businessId = this.requireBusinessId()
    // The contact rules are @biztrack/domain's (R16), the ones the server applies.
    this.assertContactInput(input)
    const name = input.name.trim()
    const phone = normalizePhone(input.phone)
    const phoneAlt = normalizePhone(input.phoneAlt)
    const email = normalizeEmail(input.email)
    const others = this.contactsForRules(businessId)
    const clashes = findContactClashes({ name, phone, email }, others)
    const duplicate = clashes.duplicates[0]
    if (duplicate && input.onDuplicate !== 'CREATE') {
      // Refused by default; the screen asks the person to merge, create anyway or cancel.
      if (input.onDuplicate !== 'MERGE') throw contactDuplicateError(duplicate)
      const target = others.find((other) => other.id === duplicate.contactId)!
      const merged = mergeContact(target, {
        type: input.type,
        name,
        phone,
        phoneAlt,
        email,
        address: input.address,
        notes: input.notes,
      })
      return this.update(target.id, {
        type: merged.type as CreateContactRequest['type'],
        name: merged.name,
        phone: merged.phone ?? undefined,
        phoneAlt: merged.phoneAlt ?? undefined,
        email: merged.email ?? undefined,
        address: merged.address ?? undefined,
        notes: merged.notes ?? undefined,
      })
    }
    if (clashes.nameTaken) throw new Error(NAME_TAKEN_MESSAGE)
    input = {
      ...input,
      name,
      phone: phone ?? undefined,
      phoneAlt: phoneAlt ?? undefined,
      email: email ?? undefined,
    }
    const id = randomUUID()
    const now = new Date().toISOString()
    this.db.run(
      `INSERT INTO contacts (id, business_id, type, name, name_key, phone, phone_alt, email, address, notes, id_type, id_number, id_issue_date, id_expiry_date, id_documents, selfie_url, is_active, created_by_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, ?, ?)`,
      [
        id,
        businessId,
        input.type,
        name,
        contactNameKey(name),
        clean(input.phone),
        clean(input.phoneAlt),
        clean(input.email),
        clean(input.address),
        clean(input.notes),
        clean(input.idType),
        clean(input.idNumber),
        clean(input.idIssueDate),
        clean(input.idExpiryDate),
        docsJson(input.idDocuments),
        clean(input.selfieUrl),
        now,
        now,
      ],
    )
    this.enqueue(id, businessId, this.payload(input.type, name, input, true, now), now)
    this.onMutated()
    const created = this.getOne(id)!
    this.audit?.log({
      action: 'CREATE',
      entityType: 'contact',
      entityId: id,
      entityLabel: name,
      changes: { before: null, after: created },
    })
    return created
  }

  update(id: string, input: UpdateContactRequest): LocalContact {
    const businessId = this.requireBusinessId()
    const before = this.getOne(id)
    if (!before) throw new Error('Contact not found.')
    const type = input.type ?? (before.type as CreateContactRequest['type'])
    const name = (input.name ?? before.name).trim()
    this.assertContactInput({ name, phone: input.phone, phoneAlt: input.phoneAlt })
    if (contactNameKey(name) !== contactNameKey(before.name)) {
      const { nameTaken } = findContactClashes(
        { name, selfId: id },
        this.contactsForRules(businessId),
      )
      if (nameTaken) throw new Error(NAME_TAKEN_MESSAGE)
    }
    const phone = input.phone !== undefined ? normalizePhone(input.phone) : before.phone
    const phoneAlt = input.phoneAlt !== undefined ? normalizePhone(input.phoneAlt) : before.phoneAlt
    const email = input.email !== undefined ? normalizeEmail(input.email) : before.email
    const address = input.address !== undefined ? clean(input.address) : before.address
    const notes = input.notes !== undefined ? clean(input.notes) : before.notes
    const idType = input.idType !== undefined ? clean(input.idType) : before.idType
    const idNumber = input.idNumber !== undefined ? clean(input.idNumber) : before.idNumber
    const idIssueDate =
      input.idIssueDate !== undefined ? clean(input.idIssueDate) : before.idIssueDate
    const idExpiryDate =
      input.idExpiryDate !== undefined ? clean(input.idExpiryDate) : before.idExpiryDate
    const idDocuments =
      input.idDocuments !== undefined ? (input.idDocuments ?? []) : before.idDocuments
    const selfieUrl = input.selfieUrl !== undefined ? clean(input.selfieUrl) : before.selfieUrl
    const now = new Date().toISOString()

    this.db.run(
      `UPDATE contacts SET type = ?, name = ?, name_key = ?, phone = ?, phone_alt = ?, email = ?, address = ?, notes = ?, id_type = ?, id_number = ?, id_issue_date = ?, id_expiry_date = ?, id_documents = ?, selfie_url = ?, updated_at = ? WHERE id = ? AND business_id = ?`,
      [
        type,
        name,
        contactNameKey(name),
        phone,
        phoneAlt,
        email,
        address,
        notes,
        idType,
        idNumber,
        idIssueDate,
        idExpiryDate,
        docsJson(idDocuments),
        selfieUrl,
        now,
        id,
        businessId,
      ],
    )
    this.enqueue(
      id,
      businessId,
      {
        type,
        name,
        phone,
        phoneAlt,
        email,
        address,
        notes,
        idType,
        idNumber,
        idIssueDate,
        idExpiryDate,
        idDocuments,
        selfieUrl,
        isActive: before.isActive,
        createdAt: before.createdAt,
      },
      now,
    )
    this.onMutated()
    const updated = this.getOne(id)!
    this.audit?.log({
      action: 'UPDATE',
      entityType: 'contact',
      entityId: id,
      entityLabel: name,
      changes: { before, after: updated },
    })
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
    this.db.run(
      `UPDATE contacts SET is_active = 0, updated_at = ? WHERE id = ? AND business_id = ?`,
      [now, id, businessId],
    )
    this.enqueue(
      id,
      businessId,
      {
        type: before.type,
        name: before.name,
        phone: before.phone,
        phoneAlt: before.phoneAlt,
        email: before.email,
        address: before.address,
        notes: before.notes,
        idType: before.idType,
        idNumber: before.idNumber,
        idIssueDate: before.idIssueDate,
        idExpiryDate: before.idExpiryDate,
        idDocuments: before.idDocuments,
        selfieUrl: before.selfieUrl,
        isActive: false,
        createdAt: before.createdAt,
      },
      now,
    )
    this.onMutated()
    this.audit?.log({
      action: 'DELETE',
      entityType: 'contact',
      entityId: id,
      entityLabel: before.name,
      changes: { before, after: null },
    })
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

  private assertContactInput(input: {
    name?: string | null
    phone?: string | null
    phoneAlt?: string | null
  }): void {
    const problem = checkContactInput(input)
    if (problem === 'CONTACT_NAME_REQUIRED') throw new Error('A contact name is required.')
    if (problem === 'CONTACT_PHONE_INVALID')
      throw new Error('Enter a valid phone number, or leave it empty.')
  }

  /** Every contact of the business, archived ones too: names stay unique across all. */
  private contactsForRules(businessId: string) {
    return this.db.query<{
      id: string
      type: string
      name: string
      phone: string | null
      phoneAlt: string | null
      email: string | null
      address: string | null
      notes: string | null
    }>(
      `SELECT id, type, name, phone, phone_alt AS phoneAlt, email, address, notes
         FROM contacts WHERE business_id = ?`,
      [businessId],
    ) as Array<{
      id: string
      type: CreateContactRequest['type']
      name: string
      phone: string | null
      phoneAlt: string | null
      email: string | null
      address: string | null
      notes: string | null
    }>
  }

  private requireBusinessId(): string {
    const businessId = this.getBusinessId()
    if (!businessId) throw new Error('No active business.')
    return businessId
  }

  private payload(
    type: string,
    name: string,
    input: CreateContactRequest,
    isActive: boolean,
    createdAt: string,
  ): Record<string, unknown> {
    return {
      type,
      name,
      phone: clean(input.phone),
      phoneAlt: clean(input.phoneAlt),
      email: clean(input.email),
      address: clean(input.address),
      notes: clean(input.notes),
      idType: clean(input.idType),
      idNumber: clean(input.idNumber),
      idIssueDate: clean(input.idIssueDate),
      idExpiryDate: clean(input.idExpiryDate),
      idDocuments: input.idDocuments ?? [],
      selfieUrl: clean(input.selfieUrl),
      isActive,
      createdAt,
    }
  }

  /** Local write + sync_outbox enqueue (entity `contacts`), coalesced per record. */
  private enqueue(
    recordId: string,
    businessId: string,
    payload: Record<string, unknown>,
    now: string,
  ): void {
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

/** Serialize the ID-document URL list to a JSON column (null when empty). */
function docsJson(d: string[] | null | undefined): string | null {
  return d && d.length ? JSON.stringify(d) : null
}

function parseDocs(v: string | null): string[] {
  if (!v) return []
  try {
    const parsed = JSON.parse(v)
    return Array.isArray(parsed) ? (parsed as string[]) : []
  } catch {
    return []
  }
}

function toLocalContact(row: ContactRow): LocalContact {
  return {
    id: row.id,
    type: row.type as LocalContact['type'],
    name: row.name,
    phone: row.phone,
    phoneAlt: row.phone_alt,
    email: row.email,
    address: row.address,
    notes: row.notes,
    idType: (row.id_type as LocalContact['idType']) ?? null,
    idNumber: row.id_number,
    idIssueDate: row.id_issue_date,
    idExpiryDate: row.id_expiry_date,
    idDocuments: parseDocs(row.id_documents),
    selfieUrl: row.selfie_url,
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
    oldestUnpaidAt: row.oldest_unpaid ?? null,
  }
}
