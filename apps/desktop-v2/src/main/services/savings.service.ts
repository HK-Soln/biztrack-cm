import { randomUUID } from 'crypto'
import type {
  AddDepositPaymentInput,
  CloseDepositInput,
  CreateDepositInput,
  CustomerDeposit,
  DepositReceipt,
  DepositReport,
  DepositReportEntry,
  DepositStatement,
  DepositStatementEntry,
  DepositStatus,
  DepositOutcome,
  DepositTransaction,
} from '@biztrack/types'
import type { DatabaseService } from '@biztrack/electron-core'
import type { DepositsListQuery, PaginatedResult } from '../../shared/ipc'
import { paginateRows, toPaginated } from './pagination'
import type { AuditLogger } from './audit.service'

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100

interface AccountRow {
  id: string
  account_number: string
  customer_id: string
  customer_name: string | null
  customer_phone: string | null
  balance: number
  total_deposited: number
  total_refunded: number
  total_used: number
  total_transferred: number
  status: string
  outcome: string | null
  closed_at: string | null
  closed_by_id: string | null
  transferred_to_id: string | null
  tagged_products: string | null
  created_at: string
  updated_at: string
  sales_count: number
}

/** The customer deposit balance a sale can draw from (the customer's OPEN session). */
export interface SavingsBalance {
  id: string
  accountNumber: string
  balance: number
}

const COLS = `s.id, s.account_number, s.customer_id, s.customer_name, s.customer_phone, s.balance,
  s.total_deposited, s.total_refunded, s.total_used, s.total_transferred, s.status, s.outcome,
  s.closed_at, s.closed_by_id, s.transferred_to_id, s.tagged_products, s.created_at, s.updated_at,
  (SELECT COUNT(*) FROM savings_transactions t WHERE t.savings_id = s.id AND t.type = 'sale') AS sales_count`

/**
 * Offline-first deposit *sessions* (frontend "Deposits", backend "savings"). A customer has
 * at most one OPEN session; closed sessions are history. Deposits top it up, sales-by-deposit
 * draw it down (goods collected), and closing nets the balance to zero (refund / transfer to a
 * new session). Every local write pushes the full session record + its transactions to the
 * outbox so the server stays in step (the API trusts the pushed account record for the balance).
 */
export class SavingsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly getBusinessId: () => string | null,
    private readonly onMutated: () => void = () => {},
    private readonly getActorId: () => string | null = () => null,
    private readonly audit?: AuditLogger,
  ) {}

  /** The customer's OPEN deposit session (or null) — what the Sell deposit tender draws from. */
  getForCustomer(customerId: string): SavingsBalance | null {
    const businessId = this.getBusinessId()
    if (!businessId) return null
    const row = this.db.get<{ id: string; account_number: string; balance: number }>(
      `SELECT id, account_number, balance FROM savings_accounts
       WHERE business_id = ? AND customer_id = ? AND status = 'OPEN' AND is_deleted = 0`,
      [businessId, customerId],
    )
    return row ? { id: row.id, accountNumber: row.account_number, balance: row.balance } : null
  }

  balanceOf(accountId: string): number | null {
    const businessId = this.getBusinessId()
    if (!businessId) return null
    const row = this.db.get<{ balance: number }>(
      `SELECT balance FROM savings_accounts WHERE id = ? AND business_id = ? AND is_deleted = 0`,
      [accountId, businessId],
    )
    return row ? row.balance : null
  }

  /** Paginated deposit sessions (newest first), filterable by status + customer search. */
  list(query: DepositsListQuery = {}): PaginatedResult<CustomerDeposit> {
    const businessId = this.getBusinessId()
    if (!businessId) return toPaginated<CustomerDeposit>([], { total: 0, page: 1, limit: 20, totalPages: 1 })
    let where = 's.business_id = ? AND s.is_deleted = 0'
    const params: unknown[] = [businessId]
    if (query.status) { where += ' AND s.status = ?'; params.push(query.status) }
    const { rows, ...meta } = paginateRows<AccountRow>(
      this.db,
      {
        from: 'savings_accounts s',
        columns: COLS,
        where,
        params,
        searchColumns: ['s.customer_name', 's.account_number'],
        defaultSort: "CASE WHEN s.status = 'OPEN' THEN 0 ELSE 1 END, s.created_at DESC",
        sortMap: { createdAt: 's.created_at', balance: 's.balance' },
      },
      query,
    )
    return toPaginated(rows.map(toCustomerDeposit), meta)
  }

  get(id: string): (CustomerDeposit & { transactions: DepositTransaction[] }) | null {
    const businessId = this.getBusinessId()
    if (!businessId) return null
    const row = this.db.get<AccountRow>(`SELECT ${COLS} FROM savings_accounts s WHERE s.id = ? AND s.business_id = ?`, [id, businessId])
    if (!row) return null
    return { ...toCustomerDeposit(row), transactions: this.txnsFor(id) }
  }

  /** Chronological statement with running balance for one session. */
  statement(id: string): DepositStatement | null {
    const businessId = this.getBusinessId()
    if (!businessId) return null
    const row = this.db.get<AccountRow>(`SELECT ${COLS} FROM savings_accounts s WHERE s.id = ? AND s.business_id = ?`, [id, businessId])
    if (!row) return null
    let running = 0
    const entries: DepositStatementEntry[] = this.txnsFor(id).map((t) => {
      running = round2(running + (t.direction === 'inbound' ? t.amount : -t.amount))
      return { id: t.id, type: t.type, direction: t.direction, amount: t.amount, method: t.method, mobileMoneyReference: t.mobileMoneyReference, saleId: t.saleId, notes: t.notes, occurredAt: t.occurredAt, createdAt: t.createdAt, runningBalance: running }
    })
    return { account: toCustomerDeposit(row), entries }
  }

  /** KPI strip: open sessions + deposits held, plus this-month collected / refunded-or-transferred. */
  summary(): { openCount: number; depositsHeld: number; collectedCount: number; collectedAmount: number; refundedTransferredCount: number; refundedTransferredAmount: number; currency: string } {
    const currency = this.businessCurrency()
    const empty = { openCount: 0, depositsHeld: 0, collectedCount: 0, collectedAmount: 0, refundedTransferredCount: 0, refundedTransferredAmount: 0, currency }
    const businessId = this.getBusinessId()
    if (!businessId) return empty
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
    const open = this.db.get<{ n: number; held: number }>(
      `SELECT COUNT(*) AS n, COALESCE(SUM(balance), 0) AS held FROM savings_accounts WHERE business_id = ? AND status = 'OPEN' AND is_deleted = 0`,
      [businessId],
    )
    const collected = this.db.get<{ n: number; amt: number }>(
      `SELECT COUNT(*) AS n, COALESCE(SUM(total_used), 0) AS amt FROM savings_accounts
       WHERE business_id = ? AND status = 'CLOSED' AND outcome LIKE 'COLLECTED%' AND closed_at >= ?`,
      [businessId, monthStart],
    )
    const refTr = this.db.get<{ n: number; amt: number }>(
      `SELECT COUNT(*) AS n, COALESCE(SUM(total_refunded + total_transferred), 0) AS amt FROM savings_accounts
       WHERE business_id = ? AND status = 'CLOSED' AND closed_at >= ? AND (total_refunded > 0 OR total_transferred > 0)`,
      [businessId, monthStart],
    )
    return {
      openCount: open?.n ?? 0,
      depositsHeld: round2(open?.held ?? 0),
      collectedCount: collected?.n ?? 0,
      collectedAmount: round2(collected?.amt ?? 0),
      refundedTransferredCount: refTr?.n ?? 0,
      refundedTransferredAmount: round2(refTr?.amt ?? 0),
      currency,
    }
  }

  private businessCurrency(): string {
    const businessId = this.getBusinessId()
    if (!businessId) return 'XAF'
    return this.db.get<{ currency: string }>(`SELECT currency FROM local_businesses WHERE id = ?`, [businessId])?.currency ?? 'XAF'
  }

  /** Open a new deposit session for a customer (fails if one is already open). */
  createSession(input: CreateDepositInput): CustomerDeposit {
    const businessId = this.requireBusinessId()
    if (!input.customerId?.trim()) throw new Error('Pick a customer.')
    const open = this.db.get<{ id: string }>(
      `SELECT id FROM savings_accounts WHERE business_id = ? AND customer_id = ? AND status = 'OPEN' AND is_deleted = 0`,
      [businessId, input.customerId],
    )
    if (open) throw new Error('This customer already has an open deposit session.')

    const id = randomUUID()
    const now = new Date().toISOString()
    const accountNumber = `DEP-${now.slice(0, 10).replace(/-/g, '')}-${id.slice(0, 4).toUpperCase()}`
    const name = this.db.get<{ name: string }>(`SELECT name FROM contacts WHERE id = ?`, [input.customerId])?.name ?? input.customerName ?? null
    const tagged = input.taggedProducts && input.taggedProducts.length ? JSON.stringify(input.taggedProducts) : null
    const initial = round2(Number(input.initialDeposit?.amount ?? 0))
    const balance = initial > 0 ? initial : 0

    this.db.run(
      `INSERT INTO savings_accounts
        (id, business_id, customer_id, customer_name, customer_phone, account_number, balance,
         total_deposited, total_refunded, total_used, total_transferred, status, tagged_products, is_deleted, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 'OPEN', ?, 0, ?, ?)`,
      [id, businessId, input.customerId, name, input.customerPhone ?? null, accountNumber, balance, balance, tagged, now, now],
    )
    if (initial > 0) {
      this.insertTxn(id, businessId, { type: 'deposit', direction: 'inbound', amount: initial, method: input.initialDeposit?.method ?? 'CASH', mobileMoneyReference: input.initialDeposit?.mobileMoneyReference ?? null, notes: input.initialDeposit?.notes ?? null }, now)
    }
    this.pushSession(id, businessId, now)
    this.onMutated()
    this.audit?.log({ action: 'CREATE', entityType: 'deposit', entityId: id, entityLabel: accountNumber, changes: { before: null, after: { customerId: input.customerId, initial } } })
    return this.get(id)!
  }

  /** Top up an open session. */
  addPayment(id: string, input: AddDepositPaymentInput): CustomerDeposit {
    const businessId = this.requireBusinessId()
    const acc = this.requireOpen(id, businessId)
    const amount = round2(Number(input.amount))
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Deposit amount must be greater than 0.')
    const now = new Date().toISOString()
    this.db.run(
      `UPDATE savings_accounts SET balance = ?, total_deposited = ?, updated_at = ? WHERE id = ? AND business_id = ?`,
      [round2(acc.balance + amount), round2(acc.total_deposited + amount), now, id, businessId],
    )
    this.insertTxn(id, businessId, { type: 'deposit', direction: 'inbound', amount, method: input.method ?? 'CASH', mobileMoneyReference: input.mobileMoneyReference ?? null, notes: input.notes ?? null }, now)
    this.pushSession(id, businessId, now)
    this.onMutated()
    this.audit?.log({ action: 'UPDATE', entityType: 'deposit', entityId: id, entityLabel: acc.account_number, changes: { before: { balance: acc.balance }, after: { deposit: amount, balance: round2(acc.balance + amount) } } })
    return this.get(id)!
  }

  /**
   * Close a session. Nets the leftover balance to zero by REFUND or TRANSFER (to a new open
   * session), or NONE when the balance is already zero. Outcome is explicit; transfer requires
   * at least one goods-collection sale. Returns the closed session.
   */
  close(id: string, input: CloseDepositInput): CustomerDeposit {
    const businessId = this.requireBusinessId()
    const acc = this.requireOpen(id, businessId)
    const leftover = round2(acc.balance)
    const hasSales = acc.sales_count > 0
    const now = new Date().toISOString()

    if (input.settlement === 'NONE') {
      if (leftover > 0) throw new Error('There is a leftover balance — refund it or transfer it to a new session.')
    } else if (input.settlement === 'REFUND') {
      if (leftover <= 0) throw new Error('Nothing to refund.')
      this.insertTxn(id, businessId, { type: 'refund', direction: 'outbound', amount: leftover, method: input.method ?? 'CASH', mobileMoneyReference: input.mobileMoneyReference ?? null, notes: input.notes ?? null }, now)
      this.db.run(`UPDATE savings_accounts SET balance = 0, total_refunded = ?, updated_at = ? WHERE id = ?`, [round2(acc.total_refunded + leftover), now, id])
    } else if (input.settlement === 'TRANSFER') {
      if (!hasSales) throw new Error('A session with no goods collected cannot be transferred — refund it instead.')
      if (leftover <= 0) throw new Error('Nothing to transfer.')
      // Out of this session, into a fresh open session for the same customer.
      this.insertTxn(id, businessId, { type: 'transfer_out', direction: 'outbound', amount: leftover, method: null, mobileMoneyReference: null, notes: input.notes ?? null }, now)
      this.db.run(`UPDATE savings_accounts SET balance = 0, total_transferred = ?, updated_at = ? WHERE id = ?`, [round2(acc.total_transferred + leftover), now, id])
      const newId = randomUUID()
      const accountNumber = `DEP-${now.slice(0, 10).replace(/-/g, '')}-${newId.slice(0, 4).toUpperCase()}`
      this.db.run(
        `INSERT INTO savings_accounts
          (id, business_id, customer_id, customer_name, customer_phone, account_number, balance,
           total_deposited, total_refunded, total_used, total_transferred, status, tagged_products, is_deleted, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 'OPEN', NULL, 0, ?, ?)`,
        [newId, businessId, acc.customer_id, acc.customer_name, acc.customer_phone, accountNumber, leftover, leftover, now, now],
      )
      this.insertTxn(newId, businessId, { type: 'transfer_in', direction: 'inbound', amount: leftover, method: null, mobileMoneyReference: null, notes: `From ${acc.account_number}` }, now)
      this.db.run(`UPDATE savings_accounts SET transferred_to_id = ? WHERE id = ?`, [newId, id])
      this.pushSession(newId, businessId, now)
    }

    const outcome = !hasSales
      ? 'REFUNDED'
      : input.settlement === 'REFUND'
        ? 'COLLECTED_REFUNDED'
        : input.settlement === 'TRANSFER'
          ? 'COLLECTED_TRANSFERRED'
          : 'COLLECTED'
    this.db.run(
      `UPDATE savings_accounts SET status = 'CLOSED', outcome = ?, closed_at = ?, closed_by_id = ?, updated_at = ? WHERE id = ? AND business_id = ?`,
      [outcome, now, this.getActorId(), now, id, businessId],
    )
    this.pushSession(id, businessId, now)
    this.onMutated()
    this.audit?.log({ action: 'UPDATE', entityType: 'deposit', entityId: id, entityLabel: acc.account_number, changes: { before: { status: 'OPEN', balance: leftover }, after: { status: 'CLOSED', outcome, settlement: input.settlement } } })
    return this.get(id)!
  }

  /**
   * Draw `amount` from a deposit session to pay (part of) a sale — the "goods collected" record.
   */
  recordSaleUsage(input: { accountId: string; saleId: string; amount: number; now: string; recordedById: string | null }): boolean {
    const businessId = this.getBusinessId()
    if (!businessId) return false
    const amount = round2(input.amount)
    if (amount <= 0) return false
    const acc = this.db.get<AccountRow>(`SELECT ${COLS} FROM savings_accounts s WHERE s.id = ? AND s.business_id = ? AND s.is_deleted = 0`, [input.accountId, businessId])
    if (!acc || acc.status !== 'OPEN' || acc.balance < amount) return false

    this.db.run(
      `UPDATE savings_accounts SET balance = ?, total_used = ?, updated_at = ? WHERE id = ? AND business_id = ?`,
      [round2(acc.balance - amount), round2(acc.total_used + amount), input.now, acc.id, businessId],
    )
    this.insertTxn(acc.id, businessId, { type: 'sale', direction: 'outbound', amount, method: 'SAVINGS', mobileMoneyReference: null, notes: null, saleId: input.saleId, recordedById: input.recordedById }, input.now)
    this.pushSession(acc.id, businessId, input.now)
    return true
  }

  /**
   * Build a shareable receipt for one deposit/refund transaction — balance shown is the
   * running balance through that transaction. Returns null for non-cash-movement rows
   * (sales/transfers don't get a customer deposit receipt).
   */
  buildDepositReceipt(transactionId: string): { receipt: DepositReceipt; phone: string | null; email: string | null } | null {
    const businessId = this.getBusinessId()
    if (!businessId) return null
    const tx = this.db.get<{ id: string; savings_id: string; type: string; direction: string; amount: number; method: string | null; occurred_at: string; created_at: string }>(
      `SELECT id, savings_id, type, direction, amount, method, occurred_at, created_at FROM savings_transactions WHERE id = ? AND business_id = ?`,
      [transactionId, businessId],
    )
    if (!tx || (tx.type !== 'deposit' && tx.type !== 'refund')) return null
    const acc = this.db.get<AccountRow>(`SELECT ${COLS} FROM savings_accounts s WHERE s.id = ? AND s.business_id = ?`, [tx.savings_id, businessId])
    if (!acc) return null
    const biz = this.db.get<{ name: string; phone: string | null; address: string | null }>(`SELECT name, phone, address FROM local_businesses WHERE id = ?`, [businessId])
    const email = this.db.get<{ email: string | null }>(`SELECT email FROM contacts WHERE id = ?`, [acc.customer_id])?.email ?? null
    // Running balance through this transaction (chronological).
    const balanceAfter = this.db.get<{ bal: number }>(
      `SELECT COALESCE(SUM(CASE WHEN direction = 'inbound' THEN amount ELSE -amount END), 0) AS bal
       FROM savings_transactions WHERE savings_id = ?
         AND (occurred_at < ? OR (occurred_at = ? AND created_at <= ?))`,
      [tx.savings_id, tx.occurred_at, tx.occurred_at, tx.created_at],
    )?.bal ?? 0

    const receipt: DepositReceipt = {
      businessName: biz?.name ?? 'BizTrack',
      businessPhone: biz?.phone ?? null,
      businessAddress: biz?.address ?? null,
      receiptNumber: `${acc.account_number}-R${tx.id.slice(0, 4).toUpperCase()}`,
      sessionRef: acc.account_number,
      occurredAt: tx.occurred_at,
      customerName: acc.customer_name,
      customerPhone: acc.customer_phone,
      kind: tx.type === 'refund' ? 'refund' : 'deposit',
      amount: round2(tx.amount),
      method: tx.method,
      balanceAfter: round2(balanceAfter),
      totalDeposited: acc.total_deposited,
      currency: this.businessCurrency(),
    }
    return { receipt, phone: acc.customer_phone, email }
  }

  /** Build the full session report (header, summary, tagged items, running-balance statement). */
  buildDepositReport(id: string): { report: DepositReport; phone: string | null; email: string | null } | null {
    const businessId = this.getBusinessId()
    if (!businessId) return null
    const acc = this.db.get<AccountRow>(`SELECT ${COLS} FROM savings_accounts s WHERE s.id = ? AND s.business_id = ?`, [id, businessId])
    if (!acc) return null
    const biz = this.db.get<{ name: string; phone: string | null; address: string | null }>(`SELECT name, phone, address FROM local_businesses WHERE id = ?`, [businessId])
    const email = this.db.get<{ email: string | null }>(`SELECT email FROM contacts WHERE id = ?`, [acc.customer_id])?.email ?? null

    let running = 0
    const entries: DepositReportEntry[] = this.txnsFor(id).map((t) => {
      running = round2(running + (t.direction === 'inbound' ? t.amount : -t.amount))
      return { occurredAt: t.occurredAt, type: t.type, direction: t.direction, amount: t.amount, method: t.method, notes: t.notes, runningBalance: running }
    })

    const report: DepositReport = {
      businessName: biz?.name ?? 'BizTrack',
      businessPhone: biz?.phone ?? null,
      businessAddress: biz?.address ?? null,
      sessionRef: acc.account_number,
      createdAt: acc.created_at,
      status: acc.status as DepositStatus,
      outcome: (acc.outcome as DepositOutcome) ?? null,
      closedAt: acc.closed_at,
      customerName: acc.customer_name,
      customerPhone: acc.customer_phone,
      totalDeposited: acc.total_deposited,
      totalUsed: acc.total_used,
      totalRefunded: acc.total_refunded,
      totalTransferred: acc.total_transferred,
      balance: acc.balance,
      currency: this.businessCurrency(),
      taggedProducts: acc.tagged_products ? JSON.parse(acc.tagged_products) : [],
      entries,
    }
    return { report, phone: acc.customer_phone, email }
  }

  // ---- internals -----------------------------------------------------------

  private txnsFor(savingsId: string): DepositTransaction[] {
    const businessId = this.getBusinessId()!
    return this.db
      .query<{ id: string; type: string; direction: string; amount: number; method: string | null; mobile_money_reference: string | null; sale_id: string | null; notes: string | null; recorded_by_id: string | null; occurred_at: string; created_at: string }>(
        `SELECT id, type, direction, amount, method, mobile_money_reference, sale_id, notes, recorded_by_id, occurred_at, created_at
         FROM savings_transactions WHERE savings_id = ? ORDER BY occurred_at ASC, created_at ASC`,
        [savingsId],
      )
      .map((t) => ({
        id: t.id, savingsId, businessId, type: t.type as DepositTransaction['type'], direction: t.direction as DepositTransaction['direction'],
        amount: t.amount, method: t.method, mobileMoneyReference: t.mobile_money_reference, saleId: t.sale_id, notes: t.notes,
        recordedById: t.recorded_by_id, occurredAt: t.occurred_at, createdAt: t.created_at,
      }))
  }

  private insertTxn(
    savingsId: string,
    businessId: string,
    tx: { type: DepositTransaction['type']; direction: DepositTransaction['direction']; amount: number; method?: string | null; mobileMoneyReference?: string | null; notes?: string | null; saleId?: string | null; recordedById?: string | null },
    now: string,
  ): void {
    const id = randomUUID()
    const recordedById = tx.recordedById ?? this.getActorId()
    this.db.run(
      `INSERT INTO savings_transactions (id, savings_id, business_id, type, direction, amount, method, mobile_money_reference, sale_id, notes, recorded_by_id, occurred_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, savingsId, businessId, tx.type, tx.direction, round2(tx.amount), tx.method ?? null, tx.mobileMoneyReference ?? null, tx.saleId ?? null, tx.notes ?? null, recordedById, now, now],
    )
    this.enqueue('savingsTransactions', id, {
      transactionId: id, savingsId, businessId, type: tx.type, direction: tx.direction, amount: round2(tx.amount),
      method: tx.method ?? null, mobileMoneyReference: tx.mobileMoneyReference ?? null, saleId: tx.saleId ?? null,
      notes: tx.notes ?? null, recordedById, occurredAt: now, createdAt: now,
    }, now)
  }

  /** Push the session's current full state so the server mirrors it (it trusts this record). */
  private pushSession(id: string, businessId: string, now: string): void {
    const acc = this.db.get<AccountRow>(`SELECT ${COLS} FROM savings_accounts s WHERE s.id = ? AND s.business_id = ?`, [id, businessId])
    if (!acc) return
    this.enqueue('savings', id, {
      savingsId: id, businessId, customerId: acc.customer_id, accountNumber: acc.account_number,
      balance: acc.balance, totalDeposited: acc.total_deposited, totalRefunded: acc.total_refunded,
      totalUsed: acc.total_used, totalTransferred: acc.total_transferred, status: acc.status, outcome: acc.outcome,
      closedAt: acc.closed_at, closedById: acc.closed_by_id, transferredToId: acc.transferred_to_id,
      taggedProducts: acc.tagged_products ? JSON.parse(acc.tagged_products) : null,
      customerName: acc.customer_name, customerPhone: acc.customer_phone, createdAt: acc.created_at, updatedAt: now,
    }, now)
  }

  private requireOpen(id: string, businessId: string): AccountRow {
    const acc = this.db.get<AccountRow>(`SELECT ${COLS} FROM savings_accounts s WHERE s.id = ? AND s.business_id = ? AND s.is_deleted = 0`, [id, businessId])
    if (!acc) throw new Error('Deposit session not found.')
    if (acc.status !== 'OPEN') throw new Error('This deposit session is closed.')
    return acc
  }

  private requireBusinessId(): string {
    const businessId = this.getBusinessId()
    if (!businessId) throw new Error('No active business.')
    return businessId
  }

  private enqueue(entity: 'savings' | 'savingsTransactions', recordId: string, payload: Record<string, unknown>, now: string): void {
    this.db.run(
      `INSERT INTO sync_outbox (id, entity, record_id, operation, payload, status, attempt_count, created_at, updated_at)
       VALUES (?, ?, ?, 'UPSERT', ?, 'pending', 0, ?, ?)
       ON CONFLICT(entity, record_id) DO UPDATE SET
         operation = excluded.operation, payload = excluded.payload, status = 'pending',
         attempt_count = 0, next_attempt_at = NULL, last_error = NULL, updated_at = excluded.updated_at`,
      [randomUUID(), entity, recordId, JSON.stringify(payload), now, now],
    )
  }
}

function toCustomerDeposit(r: AccountRow): CustomerDeposit {
  return {
    id: r.id,
    businessId: '',
    customerId: r.customer_id,
    customerName: r.customer_name,
    customerPhone: r.customer_phone,
    accountNumber: r.account_number,
    balance: r.balance,
    totalDeposited: r.total_deposited,
    totalRefunded: r.total_refunded,
    totalUsed: r.total_used,
    totalTransferred: r.total_transferred,
    status: r.status as CustomerDeposit['status'],
    outcome: (r.outcome as CustomerDeposit['outcome']) ?? null,
    closedAt: r.closed_at,
    closedById: r.closed_by_id,
    transferredToId: r.transferred_to_id,
    salesCount: r.sales_count,
    taggedProducts: r.tagged_products ? JSON.parse(r.tagged_products) : null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}
