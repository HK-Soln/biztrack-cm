import { randomUUID } from 'crypto'
import type { DatabaseService } from '@biztrack/electron-core'
import { CashMovementKind, DEFAULT_CREDIT_DAYS, type DebtStatus } from '@biztrack/types'
import {
  buildAgeingReport,
  buildContactStatement,
  checkDebtPayment,
  debtAfterChange,
  debtBalance,
  debtCanBeWrittenOff,
  debtSettledAt,
  debtStanding,
  openDebtSql,
  planDebtOffset,
  reduceDebt,
} from '@biztrack/domain'
import type { AgeingReport, ContactStatement, DebtDirection } from '@biztrack/types'
import type {
  DebtsQuery,
  LocalDebt,
  PaginatedResult,
  RecordDebtPaymentRequest,
} from '../../shared/ipc'
import { paginateRows, toPaginated } from './pagination'
import { localBusinessDate } from './business-calendar'
import type { AuditLogger } from './audit.service'

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
    /** Records a cash_movement against the open shift when a debt is paid in cash
     * (BIZ-2.3) — so the drawer reconciles against debt payments, not just sales. */
    private readonly recordCashMovement: (input: {
      kind: CashMovementKind
      amount: number
      referenceType?: string | null
      referenceId?: string | null
    }) => void = () => {},
  ) {}

  /**
   * Create a debt from a source transaction (a credit sale → receivable, a credit restock →
   * supplier payable). Idempotent per source: returns the existing debt id if there is one.
   *
   * The debt of a sale or a restock is derived from that record: the server creates its own
   * when the sale or restock syncs, so this one is not pushed, and its id is the fixed
   * `debt:<source>:<id>` the server's record pulls back onto. (SQLite triggers used to
   * create these rows; the rule now lives here.)
   */
  createSourceDebt(input: CreateSourceDebtInput): string {
    const businessId = this.requireBusinessId()
    const existing = this.db.get<{ id: string }>(
      `SELECT id FROM debts WHERE business_id = ? AND source_type = ? AND source_id = ? AND direction = ?`,
      [businessId, input.sourceType, input.sourceId, input.direction],
    )
    if (existing) {
      // Apply an explicit due date (e.g. credit terms chosen at checkout) to a row that
      // already exists.
      if (input.dueDate) {
        this.db.run(`UPDATE debts SET due_date = ? WHERE id = ?`, [input.dueDate, existing.id])
      }
      return existing.id
    }

    const derived = input.sourceType === 'SALE' || input.sourceType === 'RESTOCK'
    const id = derived ? `debt:${input.sourceType.toLowerCase()}:${input.sourceId}` : randomUUID()
    const now = input.createdAt ?? new Date().toISOString()
    // Local trading day (BIZ-5.1) from the debt's creation timestamp.
    const businessDate = localBusinessDate(now)
    this.db.run(
      `INSERT INTO debts (id, business_id, contact_id, direction, source_type, source_id, source_reference, original_amount, status, due_date, notes, business_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'OUTSTANDING', ?, ?, ?, ?)`,
      [
        id,
        businessId,
        input.contactId,
        input.direction,
        input.sourceType,
        input.sourceId,
        input.sourceReference,
        input.originalAmount,
        input.dueDate ?? null,
        input.notes ?? null,
        businessDate,
        now,
      ],
    )
    if (derived) return id
    this.enqueue(id, businessId, now)
    this.onMutated()
    this.audit?.log({
      action: 'CREATE',
      entityType: 'debt',
      entityId: id,
      entityLabel: input.sourceReference,
      changes: {
        before: null,
        after: {
          direction: input.direction,
          sourceType: input.sourceType,
          originalAmount: input.originalAmount,
          contactId: input.contactId,
        },
      },
    })
    return id
  }

  /**
   * What is still owed and what has been paid on the debt of a source (a sale's receivable),
   * for deciding a return. Zeros when there is no debt; a written-off debt owes nothing.
   */
  sourceDebtBalance(
    sourceType: 'SALE' | 'RESTOCK',
    sourceId: string,
  ): { outstanding: number; paid: number } {
    const debt = this.sourceDebt(sourceType, sourceId)
    if (!debt) return { outstanding: 0, paid: 0 }
    // A written-off debt owes nothing (@biztrack/domain debtBalance, as the server).
    const standing = debtBalance({
      originalAmount: debt.original_amount,
      paidAmount: debt.paid,
      status: debt.status as DebtStatus,
    })
    return { outstanding: standing.outstandingAmount, paid: standing.paidAmount }
  }

  /**
   * Take returned goods off the debt of a source (ruling R10). How far the debt comes down
   * and where it then stands is `reduceDebt` in @biztrack/domain, as on the server. Not
   * pushed: the server reduces its own record when the return syncs.
   */
  reduceSourceDebt(sourceType: 'SALE' | 'RESTOCK', sourceId: string, amount: number): void {
    if (!(amount > 0)) return
    const debt = this.sourceDebt(sourceType, sourceId)
    if (!debt || !debtCanBeWrittenOff(debt.status as never)) return
    const reduced = reduceDebt({
      originalAmount: debt.original_amount,
      paidAmount: debt.paid,
      reduction: amount,
    })
    this.db.run(`UPDATE debts SET original_amount = ?, status = ?, settled_at = ? WHERE id = ?`, [
      reduced.originalAmount,
      reduced.standing.status,
      debtSettledAt(reduced.standing, debt.settled_at, new Date().toISOString()),
      debt.id,
    ])
  }

  /**
   * Write off the debt of a source that was cancelled (a voided sale, everything returned).
   * A debt already paid in full stays settled (ruling R11). Not pushed: the server writes
   * its own record off when the void or return syncs.
   */
  writeOffSourceDebt(input: {
    sourceType: 'SALE' | 'RESTOCK'
    sourceId: string
    reason: string
    at: string
    by: string | null
  }): void {
    const debt = this.sourceDebt(input.sourceType, input.sourceId)
    if (!debt || !debtCanBeWrittenOff(debt.status as never)) return
    this.db.run(
      `UPDATE debts SET status = 'WRITTEN_OFF', settled_at = NULL, written_off_at = ?,
              written_off_by = ?, written_off_reason = ?
        WHERE id = ?`,
      [input.at, input.by, input.reason.trim() || 'Written off', debt.id],
    )
  }

  private sourceDebt(sourceType: string, sourceId: string) {
    return this.db.get<{
      id: string
      original_amount: number
      status: string
      settled_at: string | null
      paid: number
    }>(
      `SELECT d.id, d.original_amount, d.status, d.settled_at,
              COALESCE((SELECT SUM(amount) FROM debt_payments WHERE debt_id = d.id), 0) AS paid
         FROM debts d
        WHERE d.business_id = ? AND d.source_type = ? AND d.source_id = ?`,
      [this.requireBusinessId(), sourceType, sourceId],
    )
  }

  /**
   * Create or update the debt that mirrors a contact's opening balance so it can be paid like any
   * other debt. Natural key (business, OPENING_BALANCE, contactId, direction) with
   * `source_id = contactId` — deterministic and identical on desktop + cloud, so the two converge
   * on sync instead of duplicating. `created_at` is pinned to the opening date so it sorts to the
   * top of the account statement. On amount change the status is recomputed from any payments.
   */
  upsertOpeningBalanceDebt(input: {
    contactId: string
    direction: 'RECEIVABLE' | 'PAYABLE'
    amount: number
    asOfDate: string
  }): string {
    const businessId = this.requireBusinessId()
    const now = new Date().toISOString()
    const existing = this.db.get<{ id: string; status: string; settled_at: string | null }>(
      `SELECT id, status, settled_at FROM debts WHERE business_id = ? AND source_type = 'OPENING_BALANCE' AND source_id = ? AND direction = ?`,
      [businessId, input.contactId, input.direction],
    )

    if (existing) {
      if (existing.status === 'WRITTEN_OFF') return existing.id
      const paid =
        this.db.get<{ p: number }>(
          `SELECT COALESCE(SUM(amount), 0) AS p FROM debt_payments WHERE debt_id = ?`,
          [existing.id],
        )?.p ?? 0
      const standing = debtStanding({ originalAmount: input.amount, paidAmount: paid })
      this.db.run(
        `UPDATE debts SET original_amount = ?, status = ?, settled_at = ? WHERE id = ? AND business_id = ?`,
        [
          input.amount,
          standing.status,
          debtSettledAt(standing, existing.settled_at, now),
          existing.id,
          businessId,
        ],
      )
      this.enqueue(existing.id, businessId, now)
      this.onMutated()
      return existing.id
    }

    const id = randomUUID()
    const createdAt = `${input.asOfDate}T00:00:00.000Z`
    // Local trading day (BIZ-5.1) from the opening-balance date.
    const businessDate = localBusinessDate(input.asOfDate)
    this.db.run(
      `INSERT INTO debts (id, business_id, contact_id, direction, source_type, source_id, source_reference, original_amount, status, due_date, notes, business_date, created_at)
       VALUES (?, ?, ?, ?, 'OPENING_BALANCE', ?, 'Opening balance', ?, 'OUTSTANDING', NULL, NULL, ?, ?)`,
      [
        id,
        businessId,
        input.contactId,
        input.direction,
        input.contactId,
        input.amount,
        businessDate,
        createdAt,
      ],
    )
    this.enqueue(id, businessId, now)
    this.onMutated()
    return id
  }

  /** Record a payment against a debt; recomputes status (and settledAt). */
  /** Set (or clear) a debt's expected payment date. Clearing (null) falls the ageing/
   *  reminders back to created_at + the default credit period (D9). Re-enqueues so the
   *  change syncs (applyDebtOperation upserts due_date). Opening balances are rejected. */
  updateDueDate(debtId: string, dueDate: string | null): LocalDebt {
    const businessId = this.requireBusinessId()
    const debt = this.getRow(debtId, businessId)
    if (!debt) throw new Error('Debt not found.')
    if (debt.source_type === 'OPENING_BALANCE')
      throw new Error('Opening-balance debts have no due date.')
    const now = new Date().toISOString()
    this.db.run(`UPDATE debts SET due_date = ? WHERE id = ? AND business_id = ?`, [
      dueDate || null,
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
      changes: { before: { dueDate: debt.due_date ?? null }, after: { dueDate: dueDate || null } },
    })
    const updated = this.get(debtId)
    if (!updated) throw new Error('Debt not found.')
    return updated
  }

  recordPayment(debtId: string, input: RecordDebtPaymentRequest): LocalDebt {
    const businessId = this.requireBusinessId()
    const debt = this.getRow(debtId, businessId)
    if (!debt) throw new Error('Debt not found.')
    const now = new Date().toISOString()
    // An open debt, above zero, not before the debt, no more than is owed:
    // @biztrack/domain's rule, as on the server.
    const payment = checkDebtPayment({
      amount: Number(input.amount),
      outstanding: debtBalance({
        originalAmount: debt.original_amount,
        paidAmount: debt.paid_amount,
        status: debt.status as DebtStatus,
      }).outstandingAmount,
      status: debt.status as DebtStatus,
      paymentDate: input.paymentDate || now,
      debtCreatedDate: debt.created_at,
    })
    if (!payment.ok)
      throw new Error(
        {
          DEBT_PAYMENT_LOCKED: 'This debt is settled or written off.',
          DEBT_PAYMENT_AMOUNT_INVALID: 'Payment amount must be greater than 0.',
          DEBT_PAYMENT_DATE_INVALID: 'The payment cannot be dated before the debt.',
          DEBT_PAYMENT_AMOUNT_EXCEEDS_OUTSTANDING: 'Payment exceeds the outstanding balance.',
        }[payment.code],
      )
    const { amount } = payment

    // Local trading day (BIZ-5.1) from the payment date.
    const businessDate = localBusinessDate(input.paymentDate || now)
    this.db.run(
      `INSERT INTO debt_payments (id, business_id, debt_id, amount, method, mobile_money_reference, payment_date, notes, recorded_by, business_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        businessId,
        debtId,
        amount,
        input.method,
        input.mobileMoneyReference ?? null,
        input.paymentDate || now,
        input.notes ?? null,
        this.getActorId() ?? 'unknown',
        businessDate,
        now,
      ],
    )

    // Where the debt now stands is @biztrack/domain's rule, the one the server applies.
    const next = debtAfterChange({
      originalAmount: debt.original_amount,
      paidAmount: debt.paid_amount + amount,
      status: debt.status as DebtStatus,
      settledAt: debt.settled_at,
      at: now,
    })
    const { status } = next
    const paid = next.standing.paidAmount
    this.db.run(`UPDATE debts SET status = ?, settled_at = ? WHERE id = ? AND business_id = ?`, [
      status,
      next.settledAt,
      debtId,
      businessId,
    ])

    this.enqueue(debtId, businessId, now)

    // A cash payment moves the physical drawer: a customer settling a receivable is cash
    // IN (CREDIT_REPAYMENT); paying a supplier payable is cash OUT (SUPPLIER_PAYMENT).
    if (input.method === 'CASH') {
      this.recordCashMovement({
        kind:
          debt.direction === 'PAYABLE'
            ? CashMovementKind.SUPPLIER_PAYMENT
            : CashMovementKind.CREDIT_REPAYMENT,
        amount,
        referenceType: 'debt',
        referenceId: debtId,
      })
    }

    this.onMutated()
    this.audit?.log({
      action: 'UPDATE',
      entityType: 'debt',
      entityId: debtId,
      entityLabel: debt.source_reference,
      changes: {
        before: { status: debt.status, paid: debt.paid_amount },
        after: { status, paid, payment: amount },
      },
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
          `SELECT ${COLS} FROM debts d WHERE d.business_id = ? AND d.contact_id = ? AND d.direction = ? AND ${openDebtSql('d.status')} ORDER BY d.created_at ASC`,
          [businessId, contactId, direction],
        )
        .map(toLocalDebt)
        .filter((d) => d.outstandingAmount > 0)

    // How much is netted, and against which debts, is @biztrack/domain's, as on the server.
    const plan = planDebtOffset({
      receivables: openDebts('RECEIVABLE').map((d) => ({ ...d, outstanding: d.outstandingAmount })),
      payables: openDebts('PAYABLE').map((d) => ({ ...d, outstanding: d.outstandingAmount })),
    })
    if (!plan.ok) throw new Error('Nothing to offset — both sides need an open balance.')
    const { offsetAmount, receivableTotal: totalR, payableTotal: totalP } = plan

    const now = new Date().toISOString()
    const ref = `OFFSET-${now.slice(0, 10).replace(/-/g, '')}`
    let affected = 0
    for (const { debt, amount } of plan.allocations) {
      this.applyContra(debt.id, businessId, amount, ref, now)
      affected++
    }

    this.onMutated()
    this.audit?.log({
      action: 'UPDATE',
      entityType: 'contact',
      entityId: contactId,
      entityLabel: ref,
      changes: {
        before: { receivable: totalR, payable: totalP },
        after: { offsetAmount, affected },
      },
    })
    return { offsetAmount, affected }
  }

  /** Apply one cash-neutral OFFSET contra payment to a debt + re-enqueue it for sync. */
  private applyContra(
    debtId: string,
    businessId: string,
    amount: number,
    ref: string,
    now: string,
  ): void {
    const debt = this.getRow(debtId, businessId)
    if (!debt) return
    // Local trading day (BIZ-5.1) from the contra payment's timestamp.
    const businessDate = localBusinessDate(now)
    this.db.run(
      `INSERT INTO debt_payments (id, business_id, debt_id, amount, method, mobile_money_reference, payment_date, notes, recorded_by, business_date, created_at)
       VALUES (?, ?, ?, ?, 'OFFSET', NULL, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        businessId,
        debtId,
        amount,
        now,
        ref,
        this.getActorId() ?? 'unknown',
        businessDate,
        now,
      ],
    )
    // Where the debt now stands is @biztrack/domain's rule, the one the server applies.
    const next = debtAfterChange({
      originalAmount: debt.original_amount,
      paidAmount: debt.paid_amount + amount,
      status: debt.status as DebtStatus,
      settledAt: debt.settled_at,
      at: now,
    })
    const { status } = next
    const paid = next.standing.paidAmount
    this.db.run(`UPDATE debts SET status = ?, settled_at = ? WHERE id = ? AND business_id = ?`, [
      status,
      next.settledAt,
      debtId,
      businessId,
    ])
    this.enqueue(debtId, businessId, now)
    this.audit?.log({
      action: 'UPDATE',
      entityType: 'debt',
      entityId: debtId,
      entityLabel: debt.source_reference,
      changes: {
        before: { status: debt.status, paid: debt.paid_amount },
        after: { status, paid, offset: amount, reference: ref },
      },
    })
  }

  /** Paginated debts for a contact (for the contact detail ledger). */
  listByContact(contactId: string, query: DebtsQuery = {}): PaginatedResult<LocalDebt> {
    const businessId = this.getBusinessId()
    if (!businessId)
      return toPaginated<LocalDebt>([], { total: 0, page: 1, limit: 20, totalPages: 1 })

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
      ? this.db.get<{ name: string; phone: string | null }>(
          `SELECT name, phone FROM contacts WHERE id = ? AND business_id = ?`,
          [contactId, businessId],
        )
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
    const pays = this.db.query<{
      debt_id: string
      amount: number
      method: string
      mobile_money_reference: string | null
      payment_date: string | null
      created_at: string
    }>(
      `SELECT debt_id, amount, method, mobile_money_reference, payment_date, created_at FROM debt_payments WHERE debt_id IN (${ph})`,
      ids,
    )
    const writtenOff = new Map(
      this.db
        .query<{
          id: string
          written_off_at: string | null
        }>(`SELECT id, written_off_at FROM debts WHERE id IN (${ph})`, ids)
        .map((r) => [r.id, r.written_off_at]),
    )

    // The statement and its running balance are @biztrack/domain's (buildContactStatement),
    // as on the server. The opening balance is an OPENING_BALANCE debt dated to the opening day.
    const statement = buildContactStatement({
      direction,
      debts: debts.map((d) => ({
        contactId: d.contact_id,
        direction: d.direction as DebtDirection,
        sourceType: d.source_type as 'SALE',
        sourceReference: d.source_reference,
        originalAmount: d.original_amount,
        paidAmount: d.paid_amount ?? 0,
        status: d.status as DebtStatus,
        dueDate: d.due_date,
        createdAt: d.created_at,
        settledAt: d.settled_at,
        writtenOffAt: writtenOff.get(d.id) ?? null,
        payments: pays
          .filter((p) => p.debt_id === d.id)
          .map((p) => ({
            amount: p.amount,
            method: p.method,
            mobileMoneyReference: p.mobile_money_reference,
            paymentDate: (p.payment_date || p.created_at).slice(0, 10),
            createdAt: p.created_at,
          })),
      })),
    })
    return { ...base, ...statement }
  }

  /**
   * Ageing report (receivable or payable). Buckets each contact's outstanding balance by
   * how far past its EFFECTIVE due date it is (D9: due_date, else created_at + default
   * credit days) — ≤7d current, 8–15d moderate, 16–30d aged, 30d+ overdue — then adds the
   * contact's opening balance to its total. Mirrors the API OpeningBalancesService.
   * getAgeingReport (same buckets, rounding, opening-balance inclusion, sort). NOTE: a
   * business's custom defaultCreditDays isn't cached locally (settings sync deferred), so
   * offline uses DEFAULT_CREDIT_DAYS for undated debts; debts with an explicit due_date
   * are exact either way.
   */
  getAgeing(direction: DebtDirection): AgeingReport {
    const now = new Date()
    const today = now.toISOString().slice(0, 10)
    const emptyTotals = {
      openingBalance: 0,
      current: 0,
      moderate: 0,
      aged: 0,
      overdue: 0,
      pastDue: 0,
      totalOutstanding: 0,
    }
    const businessId = this.getBusinessId()
    if (!businessId) return { direction, asOf: today, entries: [], totals: emptyTotals }

    // Opening balances are now OPENING_BALANCE debts, so they come back in this scan — kept in
    // their own column (not aged), never double-counted against a separate opening-balance table.
    const debts = this.db.query<{
      contact_id: string
      source_type: string
      original_amount: number
      status: string
      created_at: string
      due_date: string | null
      paid_amount: number
    }>(
      `SELECT d.contact_id, d.source_type, d.original_amount, d.status, d.created_at, d.due_date, ${PAID} AS paid_amount
       FROM debts d WHERE d.business_id = ? AND d.direction = ? AND ${openDebtSql('d.status')}`,
      [businessId, direction],
    )
    const contactIds = [...new Set(debts.map((d) => d.contact_id))]
    const contacts = new Map<string, { name: string; phone: string | null }>()
    if (contactIds.length > 0) {
      const ph = contactIds.map(() => '?').join(',')
      const rows = this.db.query<{ id: string; name: string; phone: string | null }>(
        `SELECT id, name, phone FROM contacts WHERE business_id = ? AND id IN (${ph})`,
        [businessId, ...contactIds],
      )
      for (const r of rows) contacts.set(r.id, { name: r.name, phone: r.phone })
    }

    // The buckets, totals and order are @biztrack/domain's (buildAgeingReport), as the server.
    return buildAgeingReport({
      direction,
      creditDays: DEFAULT_CREDIT_DAYS,
      now,
      contacts,
      debts: debts.map((d) => ({
        contactId: d.contact_id,
        direction,
        sourceType: d.source_type as 'SALE',
        originalAmount: d.original_amount,
        paidAmount: d.paid_amount ?? 0,
        status: d.status as DebtStatus,
        dueDate: d.due_date,
        createdAt: d.created_at,
      })),
    })
  }

  // ---- internals -----------------------------------------------------------

  private getRow(id: string, businessId: string): DebtRow | null {
    return (
      this.db.get<DebtRow>(`SELECT ${COLS} FROM debts d WHERE d.id = ? AND d.business_id = ?`, [
        id,
        businessId,
      ]) ?? null
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
    }>(
      `SELECT id, amount, method, mobile_money_reference, payment_date, notes, recorded_by, created_at FROM debt_payments WHERE debt_id = ? ORDER BY created_at ASC`,
      [debtId],
    )

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
  // What is paid and still owed (@biztrack/domain debtBalance, as the server): whole francs,
  // nothing owed on a written-off debt.
  const balance = debtBalance({
    originalAmount: row.original_amount,
    paidAmount: row.paid_amount ?? 0,
    status: row.status as DebtStatus,
  })
  return {
    id: row.id,
    contactId: row.contact_id,
    direction: row.direction as LocalDebt['direction'],
    sourceType: row.source_type as LocalDebt['sourceType'],
    sourceReference: row.source_reference,
    originalAmount: row.original_amount,
    paidAmount: balance.paidAmount,
    outstandingAmount: balance.outstandingAmount,
    status: row.status as LocalDebt['status'],
    dueDate: row.due_date,
    notes: row.notes,
    createdAt: row.created_at,
    settledAt: row.settled_at,
  }
}
