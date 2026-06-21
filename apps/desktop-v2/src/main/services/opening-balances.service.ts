import { randomUUID } from 'crypto'
import type { DatabaseService } from '@biztrack/electron-core'
import type { LocalOpeningBalance, OpeningBalanceInput } from '../../shared/ipc'
import type { AuditLogger } from './audit.service'

interface OpeningBalanceRow {
  id: string
  contact_id: string
  direction: string
  amount: number
  as_of_date: string
  notes: string | null
  created_at: string
  updated_at: string
}

const COLS = `id, contact_id, direction, amount, as_of_date, notes, created_at, updated_at`

/**
 * Offline-first contact opening balances (balance brought forward). One per
 * (business, contact, direction) — upsert. Local write + sync_outbox (entity
 * `openingBalances` → server `opening_balance`). Mirrors the API OpeningBalancesService
 * / ContactOpeningBalance entity so the cloud applies it idempotently by (contact, direction).
 */
export class OpeningBalancesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly getBusinessId: () => string | null,
    private readonly onMutated: () => void,
    private readonly getActorId: () => string | null,
    private readonly audit?: AuditLogger,
  ) {}

  /** Create or update a contact's opening balance for a direction. */
  upsert(input: OpeningBalanceInput): LocalOpeningBalance {
    const businessId = this.requireBusinessId()
    if (!input.contactId?.trim()) throw new Error('Contact is required.')
    const amount = Number(input.amount)
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Opening balance must be greater than 0.')

    const now = new Date().toISOString()
    const asOfDate = input.asOfDate?.trim() || now.slice(0, 10)
    const recordedById = this.getActorId()
    const existing = this.db.get<{ id: string; created_at: string }>(
      `SELECT id, created_at FROM contact_opening_balances WHERE business_id = ? AND contact_id = ? AND direction = ?`,
      [businessId, input.contactId, input.direction],
    )
    const id = existing?.id ?? randomUUID()
    const createdAt = existing?.created_at ?? now

    if (existing) {
      this.db.run(
        `UPDATE contact_opening_balances SET amount = ?, as_of_date = ?, notes = ?, recorded_by_id = ?, updated_at = ? WHERE id = ?`,
        [amount, asOfDate, input.notes ?? null, recordedById, now, id],
      )
    } else {
      this.db.run(
        `INSERT INTO contact_opening_balances (id, business_id, contact_id, direction, amount, as_of_date, notes, recorded_by_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, businessId, input.contactId, input.direction, amount, asOfDate, input.notes ?? null, recordedById, createdAt, now],
      )
    }

    this.enqueue(id, businessId, { contactId: input.contactId, direction: input.direction, amount, asOfDate, notes: input.notes ?? null, recordedById, createdAt }, now)
    this.onMutated()
    this.audit?.log({
      action: existing ? 'UPDATE' : 'CREATE',
      entityType: 'opening_balance',
      entityId: id,
      entityLabel: `${input.direction} · ${amount}`,
      changes: { before: null, after: { contactId: input.contactId, direction: input.direction, amount } },
    })
    return this.get(id)!
  }

  /** A contact's opening balances (0, 1 or 2 — one per direction). */
  listForContact(contactId: string): LocalOpeningBalance[] {
    const businessId = this.getBusinessId()
    if (!businessId) return []
    return this.db
      .query<OpeningBalanceRow>(
        `SELECT ${COLS} FROM contact_opening_balances WHERE business_id = ? AND contact_id = ? ORDER BY direction ASC`,
        [businessId, contactId],
      )
      .map(toLocal)
  }

  private get(id: string): LocalOpeningBalance | null {
    const businessId = this.getBusinessId()
    if (!businessId) return null
    const row = this.db.get<OpeningBalanceRow>(`SELECT ${COLS} FROM contact_opening_balances WHERE id = ? AND business_id = ?`, [id, businessId])
    return row ? toLocal(row) : null
  }

  private enqueue(recordId: string, businessId: string, payload: Record<string, unknown>, now: string): void {
    this.db.run(
      `INSERT INTO sync_outbox (id, entity, record_id, operation, payload, status, attempt_count, created_at, updated_at)
       VALUES (?, 'openingBalances', ?, 'UPSERT', ?, 'pending', 0, ?, ?)
       ON CONFLICT(entity, record_id) DO UPDATE SET
         operation = excluded.operation, payload = excluded.payload, status = 'pending',
         attempt_count = 0, next_attempt_at = NULL, last_error = NULL, updated_at = excluded.updated_at`,
      [randomUUID(), recordId, JSON.stringify({ id: recordId, businessId, ...payload }), now, now],
    )
  }

  private requireBusinessId(): string {
    const businessId = this.getBusinessId()
    if (!businessId) throw new Error('No active business.')
    return businessId
  }
}

function toLocal(r: OpeningBalanceRow): LocalOpeningBalance {
  return {
    id: r.id,
    contactId: r.contact_id,
    direction: r.direction as LocalOpeningBalance['direction'],
    amount: r.amount,
    asOfDate: r.as_of_date,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}
