import { randomUUID } from 'crypto'
import type { DatabaseService } from '@biztrack/electron-core'

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
  created_at: string
}

/** The customer deposit balance a sale can draw from. */
export interface SavingsBalance {
  id: string
  accountNumber: string
  balance: number
}

/**
 * Offline-first savings/deposit reads + the "pay from deposit" usage write at checkout.
 * The full savings module (deposits/refunds UI) comes later; this is the minimum the Sell
 * screen needs. On a deposit-paid sale we decrement the local balance, record an outbound
 * `sale` transaction, and push BOTH the transaction and the updated account — the API keeps
 * the server balance from the pushed account record (it does not derive it from the tx).
 */
export class SavingsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly getBusinessId: () => string | null,
  ) {}

  /** The active deposit account for a customer (or null if they have none). */
  getForCustomer(customerId: string): SavingsBalance | null {
    const businessId = this.getBusinessId()
    if (!businessId) return null
    const row = this.db.get<{ id: string; account_number: string; balance: number }>(
      `SELECT id, account_number, balance FROM savings_accounts
       WHERE business_id = ? AND customer_id = ? AND is_deleted = 0`,
      [businessId, customerId],
    )
    return row ? { id: row.id, accountNumber: row.account_number, balance: row.balance } : null
  }

  /** Current balance for an account id (null if it doesn't exist) — for up-front validation. */
  balanceOf(accountId: string): number | null {
    const businessId = this.getBusinessId()
    if (!businessId) return null
    const row = this.db.get<{ balance: number }>(
      `SELECT balance FROM savings_accounts WHERE id = ? AND business_id = ? AND is_deleted = 0`,
      [accountId, businessId],
    )
    return row ? row.balance : null
  }

  /**
   * Draw `amount` from a deposit account to pay (part of) a sale. Decrements the balance,
   * records the outbound transaction, and enqueues both the transaction and the account so
   * the server balance stays in step. Returns false (no-op) if the account is missing or the
   * balance is insufficient — the caller validates beforehand, this is a safety net.
   */
  recordSaleUsage(input: { accountId: string; saleId: string; amount: number; now: string; recordedById: string | null }): boolean {
    const businessId = this.getBusinessId()
    if (!businessId) return false
    const amount = round2(input.amount)
    if (amount <= 0) return false
    const acc = this.db.get<AccountRow>(
      `SELECT id, account_number, customer_id, customer_name, customer_phone, balance, total_deposited, total_refunded, total_used, created_at
       FROM savings_accounts WHERE id = ? AND business_id = ? AND is_deleted = 0`,
      [input.accountId, businessId],
    )
    if (!acc || acc.balance < amount) return false

    const newBalance = round2(acc.balance - amount)
    const newUsed = round2(acc.total_used + amount)
    this.db.run(
      `UPDATE savings_accounts SET balance = ?, total_used = ?, updated_at = ? WHERE id = ? AND business_id = ?`,
      [newBalance, newUsed, input.now, acc.id, businessId],
    )

    const txId = randomUUID()
    this.db.run(
      `INSERT INTO savings_transactions (id, savings_id, business_id, type, direction, amount, method, mobile_money_reference, sale_id, notes, recorded_by_id, occurred_at, created_at)
       VALUES (?, ?, ?, 'sale', 'outbound', ?, 'SAVINGS', NULL, ?, NULL, ?, ?, ?)`,
      [txId, acc.id, businessId, amount, input.saleId, input.recordedById, input.now, input.now],
    )

    // Push the transaction + the account's new balance (the server trusts the account record).
    this.enqueue('savingsTransactions', txId, {
      transactionId: txId,
      savingsId: acc.id,
      businessId,
      type: 'sale',
      direction: 'outbound',
      amount,
      method: 'SAVINGS',
      saleId: input.saleId,
      recordedById: input.recordedById,
      occurredAt: input.now,
      createdAt: input.now,
    }, input.now)
    this.enqueue('savings', acc.id, {
      savingsId: acc.id,
      businessId,
      customerId: acc.customer_id,
      accountNumber: acc.account_number,
      balance: newBalance,
      totalDeposited: acc.total_deposited,
      totalRefunded: acc.total_refunded,
      totalUsed: newUsed,
      customerName: acc.customer_name,
      customerPhone: acc.customer_phone,
      createdAt: acc.created_at,
      updatedAt: input.now,
    }, input.now)
    return true
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

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
