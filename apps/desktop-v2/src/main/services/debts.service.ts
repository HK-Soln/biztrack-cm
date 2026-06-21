import { randomUUID } from 'crypto'
import type { DatabaseService } from '@biztrack/electron-core'
import { ContactStatementEntryType } from '@biztrack/types'
import type { ContactStatement, ContactStatementEntry, DebtDirection } from '@biztrack/types'
import type { DebtsQuery, LocalDebt, PaginatedResult, RecordDebtPaymentRequest } from '../../shared/ipc'
import { paginateRows, toPaginated } from './pagination'
import type { AuditLogger } from './audit.service'

const round2 = (n: number) => Math.round(n * 100) / 100

interface DebtRow {
  id: string
  contact_id: string
  direction: string
  source_type: string
  source_id: string
  source_reference: string
  original_amount: number
  status: string
  due_date: string | null
  notes: string | null
  created_at: string
  settled_at: string | null
  paid_amount: number
}

const PAID = `COALESCE((SELECT SUM(dp.amount) FROM debt_payments dp WHERE dp.debt_id = d.id), 0)`
const COLS = `d.id, d.contact_id, d.direction, d.source_type, d.source_id, d.source_reference, d.original_amount,
  d.status, d.due_date, d.notes, d.created_at, d.settled_at, ${PAID} AS paid_amount`

/** A debt the desktop creates from a source transaction (restock credit, credit sale,
 * opening balance). Mirrors DebtsService.createSourceDebt on the API. */
export interface CreateSourceDebtInput {
  contactId: string
  direction: 'RECEIVABLE' | 'PAYABLE'
  sourceType: 'SALE' | 'RESTOCK' | 'OPENING_BALANCE'
  sourceId: string
  sourceReference: string
  originalAmount: number
  dueDate?: string | null
  notes?: string | null
  createdAt?: string
}

/**
 * Offline-first debts/payables. Reads from local SQLite; writes go local + the
 * sync_outbox (entity `debts` → server `debt`, payments nested in the payload) and
 * nudge a sync. Mirrors the API debts endpoints (POST /debtors|creditors/:id/payments)
 * and the restock→payable path (DebtsService.createSourceDebt). A debt re-enqueues its
 * full state (incl. payments) on every change so the server applies idempotently.
 */
export class DebtsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly getBusinessId: () => string | null,
    private readonly onMutated: () => void,
    private readonly getActorId: () => string | null,
    private readonly audit?: AuditLogger,
  ) {}

  /** Create a debt from a source transaction (e.g. a credit restock → supplier payable).
   * Idempotent per source: returns the existing debt id if one already exists. */
  createSourceDebt(input: CreateSourceDebtInput): string {
    const businessId = this.requireBusinessId()
    const existing = this.db.get<{ id: string }>(
      `SELECT id FROM debts WHERE business_id = ? AND source_type = ? AND source_id = ? AND direction = ?`,
      [businessId, input.sourceType, input.sourceId, input.direction],
    )
    if (existing) return existing.id

    const id = randomUUID()
    const now = input.createdAt ?? new Date().toISOString()
    this.db.run(
      `INSERT INTO debts (id, business_id, contact_id, direction, source_type, source_id, source_reference, original_amount, status, due_date, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'OUTSTANDING', ?, ?, ?)`,
      [id, businessId, input.contactId, input.direction, input.sourceType, input.sourceId, input.sourceReference, input.originalAmount, input.dueDate ?? null, input.notes ?? null, now],
    )
    this.enqueue(id, businessId, now)
    this.onMutated()
    this.audit?.log({
      action: 'CREATE',
      entityType: 'debt',
      entityId: id,
      entityLabel: input.sourceReference,
      changes: { before: null, after: { direction: input.direction, sourceType: input.sourceType, originalAmount: input.originalAmount, contactId: input.contactId } },
    })
    return id
  }

  /** Record a payment against a debt; recomputes status (and settledAt). */
  recordPayment(debtId: string, input: RecordDebtPaymentRequest): LocalDebt {
    const businessId = this.requireBusinessId()
    const debt = this.getRow(debtId, businessId)
    if (!debt) throw new Error('Debt not found.')
    if (debt.status === 'WRITTEN_OFF') throw new Error('This debt has been written off.')
    const amount = Number(input.amount)
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Payment amount must be greater than 0.')
    const outstanding = debt.original_amount - debt.paid_amount
    if (amount > outstanding + 1e-6) throw new Error('Payment exceeds the outstanding balance.')

    const now = new Date().toISOString()
    this.db.run(
      `INSERT INTO debt_payments (id, business_id, debt_id, amount, method, mobile_money_reference, payment_date, notes, recorded_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [randomUUID(), businessId, debtId, amount, input.method, input.mobileMoneyReference ?? null, input.paymentDate || now, input.notes ?? null, this.getActorId() ?? 'unknown', now],
    )

    const paid = debt.paid_amount + amount
    const settled = paid >= debt.original_amount - 1e-6
    const status = settled ? 'SETTLED' : 'PARTIALLY_PAID'
    this.db.run(`UPDATE debts SET status = ?, settled_at = ? WHERE id = ? AND business_id = ?`, [
      status,
      settled ? now : null,
      debtId,
      businessId,
    ])

    this.enqueue(debtId, businessId, now)
    this.onMutated()
    this.audit?.log({
      action: 'UPDATE',
      entityType: 'debt',
      entityId: debtId,
      entityLabel: debt.source_reference,
      changes: { before: { status: debt.status, paid: debt.paid_amount }, after: { status, paid, payment: amount } },
    })
    return this.get(debtId)!
  }

  /**
   * Net a contact's open receivable vs payable balances with cash-neutral OFFSET contra
   * payments (oldest debts first). Clears the smaller side, reduces the larger; the net
   * position is unchanged. Each affected debt re-enqueues (the OFFSET payment rides the
   * existing debt sync), so the server applies it idempotently. Mirrors the API offset.
   */
  offset(contactId: string): { offsetAmount: number; affected: number } {
    const businessId = this.requireBusinessId()
    const openDebts = (direction: 'RECEIVABLE' | 'PAYABLE'): LocalDebt[] =>
      this.db
        .query<DebtRow>(
          `SELECT ${COLS} FROM debts d WHERE d.business_id = ? AND d.contact_id = ? AND d.direction = ? AND d.status != 'WRITTEN_OFF' ORDER BY d.created_at ASC`,
          [businessId, contactId, direction],
        )
        .map(toLocalDebt)
        .filter((d) => d.outstandingAmount > 0)

    const recv = openDebts('RECEIVABLE')
    const pay = openDebts('PAYABLE')
    const totalR = round2(recv.reduce((s, d) => s + d.outstandingAmount, 0))
    const totalP = round2(pay.reduce((s, d) => s + d.outstandingAmount, 0))
    const offsetAmount = round2(Math.min(totalR, totalP))
    if (offsetAmount <= 0) throw new Error('Nothing to offset — both sides need an open balance.')

    const now = new Date().toISOString()
    const ref = `OFFSET-${now.slice(0, 10).replace(/-/g, '')}`
    let affected = 0
    const allocate = (debts: LocalDebt[]) => {
      let remaining = offsetAmount
      for (const d of debts) {
        if (remaining <= 1e-6) break
        const applied = round2(Math.min(remaining, d.outstandingAmount))
        if (applied <= 0) continue
        this.applyContra(d.id, businessId, applied, ref, now)
        remaining = round2(remaining - applied)
        affected++
      }
    }
    allocate(recv)
    allocate(pay)

    this.onMutated()
    this.audit?.log({
      action: 'UPDATE',
      entityType: 'contact',
      entityId: contactId,
      entityLabel: ref,
      changes: { before: { receivable: totalR, payable: totalP }, after: { offsetAmount, affected } },
    })
    return { offsetAmount, affected }
  }

  /** Apply one cash-neutral OFFSET contra payment to a debt + re-enqueue it for sync. */
  private applyContra(debtId: string, businessId: string, amount: number, ref: string, now: string): void {
    const debt = this.getRow(debtId, businessId)
    if (!debt) return
    this.db.run(
      `INSERT INTO debt_payments (id, business_id, debt_id, amount, method, mobile_money_reference, payment_date, notes, recorded_by, created_at)
       VALUES (?, ?, ?, ?, 'OFFSET', NULL, ?, ?, ?, ?)`,
      [randomUUID(), businessId, debtId, amount, now, ref, this.getActorId() ?? 'unknown', now],
    )
    const paid = debt.paid_amount + amount
    const settled = paid >= debt.original_amount - 1e-6
    const status = settled ? 'SETTLED' : 'PARTIALLY_PAID'
    this.db.run(`UPDATE debts SET status = ?, settled_at = ? WHERE id = ? AND business_id = ?`, [
      status,
      settled ? now : null,
      debtId,
      businessId,
    ])
    this.enqueue(debtId, businessId, now)
    this.audit?.log({
      action: 'UPDATE',
      entityType: 'debt',
      entityId: debtId,
      entityLabel: debt.source_reference,
      changes: { before: { status: debt.status, paid: debt.paid_amount }, after: { status, paid, offset: amount, reference: ref } },
    })
  }

  /** Paginated debts for a contact (for the contact detail ledger). */
  listByContact(contactId: string, query: DebtsQuery = {}): PaginatedResult<LocalDebt> {
    const businessId = this.getBusinessId()
    if (!businessId) return toPaginated<LocalDebt>([], { total: 0, page: 1, limit: 20, totalPages: 1 })

    let where = 'd.business_id = ? AND d.contact_id = ?'
    const params: unknown[] = [businessId, contactId]
    if (query.status) {
      where += ' AND d.status = ?'
      params.push(query.status)
    }

    const { rows, ...meta } = paginateRows<DebtRow>(
      this.db,
      {
        from: 'debts d',
        columns: COLS,
        where,
        params,
        searchColumns: ['d.source_reference', 'd.notes'],
        defaultSort: 'd.created_at DESC',
        sortMap: { createdAt: 'd.created_at', amount: 'd.original_amount' },
      },
      query,
    )
    return toPaginated(rows.map(toLocalDebt), meta)
  }

  get(id: string): LocalDebt | null {
    const businessId = this.getBusinessId()
    if (!businessId) return null
    const row = this.getRow(id, businessId)
    return row ? toLocalDebt(row) : null
  }

  /**
   * Chronological account statement for a contact in one direction — debts (charges)
   * and payments interleaved with a running balance. Mirrors the shared ContactStatement
   * (API GET /contacts/:id/statement). Opening balance is 0 (no opening-balance feature
   * on desktop yet).
   */
  statement(contactId: string, direction: DebtDirection): ContactStatement {
    const businessId = this.getBusinessId()
    const contactRow = businessId
      ? this.db.get<{ name: string; phone: string | null }>(`SELECT name, phone FROM contacts WHERE id = ? AND business_id = ?`, [contactId, businessId])
      : null
    const base: ContactStatement = {
      contact: { id: contactId, name: contactRow?.name ?? '', phone: contactRow?.phone ?? null },
      direction,
      openingBalance: 0,
      entries: [],
      closingBalance: 0,
    }
    if (!businessId) return base

    const debts = this.db.query<DebtRow>(
      `SELECT ${COLS} FROM debts d WHERE d.business_id = ? AND d.contact_id = ? AND d.direction = ? ORDER BY d.created_at ASC`,
      [businessId, contactId, direction],
    )
    if (debts.length === 0) return base

    const ids = debts.map((d) => d.id)
    const ph = ids.map(() => '?').join(',')
    const pays = this.db.query<{ debt_id: string; amount: number; method: string; mobile_money_reference: string | null; payment_date: string | null; created_at: string }>(
      `SELECT debt_id, amount, method, mobile_money_reference, payment_date, created_at FROM debt_payments WHERE debt_id IN (${ph}) ORDER BY payment_date ASC, created_at ASC`,
      ids,
    )

    const paidByDebt = new Map<string, number>()
    for (const p of pays) paidByDebt.set(p.debt_id, (paidByDebt.get(p.debt_id) ?? 0) + p.amount)

    type Ev =
      | { date: string; kind: 'debt'; debt: DebtRow }
      | { date: string; kind: 'pay'; pay: (typeof pays)[number] }
      | { date: string; kind: 'woff'; amount: number }
    const events: Ev[] = []
    for (const d of debts) {
      events.push({ date: d.created_at, kind: 'debt', debt: d })
      if (d.status === 'WRITTEN_OFF') {
        const remaining = Math.max(0, d.original_amount - (paidByDebt.get(d.id) ?? 0))
        if (remaining > 0) events.push({ date: d.settled_at || d.created_at, kind: 'woff', amount: remaining })
      }
    }
    for (const p of pays) events.push({ date: p.payment_date || p.created_at, kind: 'pay', pay: p })
    events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

    let balance = base.openingBalance
    const entries: ContactStatementEntry[] = []
    for (const e of events) {
      if (e.kind === 'debt') {
        balance = round2(balance + e.debt.original_amount)
        entries.push({ date: e.debt.created_at, type: ContactStatementEntryType.DEBT_CREATED, direction, reference: e.debt.source_reference, description: e.debt.source_type, debit: e.debt.original_amount, credit: 0, balance })
      } else if (e.kind === 'pay') {
        balance = round2(balance - e.pay.amount)
        entries.push({ date: e.date, type: ContactStatementEntryType.PAYMENT, direction, reference: e.pay.method, description: e.pay.mobile_money_reference ?? '', debit: 0, credit: e.pay.amount, balance })
      } else {
        balance = round2(balance - e.amount)
        entries.push({ date: e.date, type: ContactStatementEntryType.WRITE_OFF, direction, reference: null, description: '', debit: 0, credit: e.amount, balance })
      }
    }
    base.entries = entries
    base.closingBalance = balance
    return base
  }

  // ---- internals -----------------------------------------------------------

  private getRow(id: string, businessId: string): DebtRow | null {
    return (
      this.db.get<DebtRow>(`SELECT ${COLS} FROM debts d WHERE d.id = ? AND d.business_id = ?`, [id, businessId]) ?? null
    )
  }

  private requireBusinessId(): string {
    const businessId = this.getBusinessId()
    if (!businessId) throw new Error('No active business.')
    return businessId
  }

  /** Enqueue the debt with its full current state (incl. nested payments) — coalesced. */
  private enqueue(debtId: string, businessId: string, now: string): void {
    const d = this.db.get<{
      contact_id: string
      direction: string
      source_type: string
      source_id: string
      source_reference: string
      original_amount: number
      status: string
      due_date: string | null
      notes: string | null
      created_at: string
      settled_at: string | null
    }>(
      `SELECT contact_id, direction, source_type, source_id, source_reference, original_amount, status, due_date, notes, created_at, settled_at
       FROM debts WHERE id = ?`,
      [debtId],
    )
    if (!d) return
    const payments = this.db.query<{
      id: string
      amount: number
      method: string
      mobile_money_reference: string | null
      payment_date: string
      notes: string | null
      recorded_by: string
      created_at: string
    }>(`SELECT id, amount, method, mobile_money_reference, payment_date, notes, recorded_by, created_at FROM debt_payments WHERE debt_id = ? ORDER BY created_at ASC`, [debtId])

    const payload = {
      id: debtId,
      businessId,
      contactId: d.contact_id,
      direction: d.direction,
      sourceType: d.source_type,
      sourceId: d.source_id,
      sourceReference: d.source_reference,
      originalAmount: d.original_amount,
      status: d.status,
      dueDate: d.due_date,
      notes: d.notes,
      createdAt: d.created_at,
      updatedAt: now,
      settledAt: d.settled_at,
      payments: payments.map((p) => ({
        id: p.id,
        amount: p.amount,
        method: p.method,
        mobileMoneyReference: p.mobile_money_reference,
        paymentDate: p.payment_date,
        notes: p.notes,
        recordedById: p.recorded_by,
        createdAt: p.created_at,
      })),
    }
    this.db.run(
      `INSERT INTO sync_outbox (id, entity, record_id, operation, payload, status, attempt_count, created_at, updated_at)
       VALUES (?, 'debts', ?, 'UPSERT', ?, 'pending', 0, ?, ?)
       ON CONFLICT(entity, record_id) DO UPDATE SET
         operation = excluded.operation, payload = excluded.payload, status = 'pending',
         attempt_count = 0, next_attempt_at = NULL, last_error = NULL, updated_at = excluded.updated_at`,
      [randomUUID(), debtId, JSON.stringify(payload), now, now],
    )
  }
}

function toLocalDebt(row: DebtRow): LocalDebt {
  const paid = row.paid_amount ?? 0
  return {
    id: row.id,
    contactId: row.contact_id,
    direction: row.direction as LocalDebt['direction'],
    sourceType: row.source_type as LocalDebt['sourceType'],
    sourceReference: row.source_reference,
    originalAmount: row.original_amount,
    paidAmount: paid,
    outstandingAmount: Math.max(0, row.original_amount - paid),
    status: row.status as LocalDebt['status'],
    dueDate: row.due_date,
    notes: row.notes,
    createdAt: row.created_at,
    settledAt: row.settled_at,
  }
}
