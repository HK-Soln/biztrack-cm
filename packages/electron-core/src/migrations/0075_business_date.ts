import type { Migration } from './runner'
import { ensureColumn } from './runner'

/**
 * BIZ-5.1 (SQLite side) — `business_date` (local trading day, TEXT 'YYYY-MM-DD') on every
 * local transaction table, mirroring the Postgres column (API 1786900000000). Stamped at
 * write time by the desktop create paths (slice 2); nullable, historical rows fall back at
 * read. Sales are back-filled from the existing `sale_date`.
 *
 * The business timezone + cutover live on `businesses` server-side; the desktop offline cache
 * (`local_businesses`) does not carry them yet, so until it does (slice 3) the desktop uses
 * the defaults (Africa/Douala + 00:00 = local calendar date), which is correct for ordinary
 * daytime retail. Server-only tables (stock_movements, online_orders) have no SQLite mirror.
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
  'cash_sessions',
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

export const migration_0075: Migration = {
  id: 75,
  name: '0075_business_date',
  up(db) {
    for (const table of TABLES) {
      ensureColumn(db, table, 'business_date', 'TEXT')
    }
    // Back-fill sales from the existing sale_date grain.
    db.exec(`UPDATE sales SET business_date = sale_date WHERE business_date IS NULL;`)
  },
}
