import type { Migration } from './runner'
import { ensureColumn } from './runner'

/**
 * BIZ-5.8 (SQLite side) — nullable `currency_code` + `outlet_id` on every local transaction
 * table, mirroring the Postgres columns (API migration 1786800000000).
 *
 * Unused today; landed early because they're trivial to add and painful to retrofit once
 * rows exist. SQLite uses TEXT for both (varchar + uuid), matching `cash_sessions.outlet_id`.
 * `cash_sessions` already has `outlet_id` (0066) → only `currency_code` is added there.
 * Server-only tables (stock_movements, online_orders) have no SQLite mirror and are absent.
 */
const TABLES = [
  'sales',
  'sale_items',
  'sale_payments',
  'sale_charges',
  'sale_discounts',
  'sale_returns',
  'sale_return_items',
  'expenses',
  'debts',
  'debt_payments',
  'contact_opening_balances',
  'cash_movements',
  'cash_count_lines',
  'savings_accounts',
  'savings_transactions',
  'inventory_movements',
  'restock_records',
  'restock_items',
  'restock_payments',
  'restock_charges',
  'restock_discounts',
  'rfqs',
  'rfq_items',
  'purchase_orders',
  'purchase_order_items',
]

export const migration_0074: Migration = {
  id: 74,
  name: '0074_transaction_currency_outlet',
  up(db) {
    for (const table of TABLES) {
      ensureColumn(db, table, 'currency_code', 'TEXT')
      ensureColumn(db, table, 'outlet_id', 'TEXT')
    }
    // cash_sessions already has outlet_id (0066) — only add the currency.
    ensureColumn(db, 'cash_sessions', 'currency_code', 'TEXT')
  },
}
