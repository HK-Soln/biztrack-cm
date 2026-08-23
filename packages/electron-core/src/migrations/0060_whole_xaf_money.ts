import type { Migration } from './runner'

/**
 * Whole-XAF money enforcement (BIZ-0.2, SQLite side).
 *
 * XAF is a zero-decimal currency, so no money column may ever hold a fractional
 * value. This migration:
 *   1. Rounds every existing money value to whole XAF (half away from zero, via
 *      SQLite `round()`), repairing any legacy sub-unit drift from the old
 *      2-decimal storage.
 *   2. Installs BEFORE INSERT / BEFORE UPDATE guard triggers that RAISE(ABORT)
 *      if any money column is written with a non-whole value — the same
 *      DB-level guarantee the API enforces with CHECK constraints.
 *
 * We use triggers rather than adding CHECK constraints because SQLite can only
 * add a CHECK by rebuilding the whole table (create-copy-drop-rename), which for
 * ~20 tables is far riskier than a set of declarative guard triggers that need
 * no schema rebuild and are trivially reversible.
 *
 * Column type/affinity is intentionally left as REAL (decision: no type change).
 * EXCLUDED — never money: quantities, rates/percentages (tax_rate, *_rate,
 * *_rate_value, discount rate), and the polymorphic charge_types.default_value.
 */

/** Live (migration 0059) money columns per table — whole-XAF amounts only. */
const MONEY_COLUMNS: Record<string, string[]> = {
  products: ['price', 'cost_price'],
  sales: [
    'subtotal',
    'net_amount',
    'discount_amount',
    'charges_amount',
    'tax_amount',
    'total_amount',
    'amount_paid',
    'credit_amount',
    'change_given',
  ],
  sale_items: ['unit_price', 'discount_amount', 'line_total', 'total_price', 'cost_price'],
  sale_payments: ['amount'],
  sale_returns: ['refund_amount'],
  sale_charges: ['amount'],
  sale_discounts: ['amount'],
  expenses: ['amount'],
  savings_accounts: [
    'balance',
    'total_deposited',
    'total_refunded',
    'total_used',
    'total_transferred',
  ],
  savings_transactions: ['amount'],
  restock_records: [
    'total_cost',
    'discount_amount',
    'charges_amount',
    'total_amount',
    'amount_paid',
    'credit_amount',
  ],
  restock_items: ['unit_cost'],
  restock_payments: ['amount'],
  restock_charges: ['amount'],
  restock_discounts: ['amount'],
  debts: ['original_amount'],
  debt_payments: ['amount'],
  contact_opening_balances: ['amount'],
  purchase_orders: ['total_amount'],
  purchase_order_items: ['unit_price'],
  rfq_suppliers: ['quoted_total'],
}

export const migration_0060: Migration = {
  id: 60,
  name: '0060_whole_xaf_money',
  up(db) {
    for (const [table, columns] of Object.entries(MONEY_COLUMNS)) {
      // 1. Round any existing fractional values to whole XAF.
      for (const col of columns) {
        db.exec(
          `UPDATE ${table} SET ${col} = round(${col}) ` +
            `WHERE ${col} IS NOT NULL AND ${col} <> round(${col})`,
        )
      }

      // 2. Guard triggers: reject a write where any money column is non-whole.
      const guard = columns
        .map((col) => `(NEW.${col} IS NOT NULL AND NEW.${col} <> round(NEW.${col}))`)
        .join(' OR ')
      const message = `${table}: money amounts must be whole XAF`
      for (const event of ['INSERT', 'UPDATE'] as const) {
        db.exec(
          `CREATE TRIGGER IF NOT EXISTS trg_${table}_whole_xaf_${event.toLowerCase()} ` +
            `BEFORE ${event} ON ${table} FOR EACH ROW WHEN ${guard} ` +
            `BEGIN SELECT RAISE(ABORT, '${message}'); END`,
        )
      }
    }
  },
}
