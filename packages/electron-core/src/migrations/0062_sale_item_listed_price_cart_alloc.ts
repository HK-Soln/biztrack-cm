import type { Migration } from './runner'
import { ensureColumn } from './runner'

/**
 * BIZ-1.1: capture the catalogue (listed) unit price on each sale line, and reserve
 * a column for the pro-rata share of a cart-level discount (populated by BIZ-1.3).
 *
 *  - `unit_price_listed`  — the catalogue price at sale time (variant.priceOverride
 *    ?? product.sellingPrice). Snapshotted so later catalogue price changes never
 *    move history. Backfilled to the charged `unit_price` for existing rows.
 *  - `cart_discount_alloc` — this line's allocated share of the sale-level discount;
 *    0 until BIZ-1.3. Line total becomes unit_price*qty − discount_amount − alloc.
 *
 * Both are money, so the whole-XAF guard triggers from migration 0060 are rebuilt
 * to cover them (SQLite triggers can't be altered in place).
 */

const SALE_ITEM_MONEY_COLUMNS = [
  'unit_price',
  'unit_price_listed',
  'cart_discount_alloc',
  'discount_amount',
  'line_total',
  'total_price',
  'cost_price',
]

export const migration_0062: Migration = {
  id: 62,
  name: '0062_sale_item_listed_price_cart_alloc',
  up(db) {
    ensureColumn(db, 'sale_items', 'unit_price_listed', 'REAL')
    ensureColumn(db, 'sale_items', 'cart_discount_alloc', 'REAL NOT NULL DEFAULT 0')

    // Existing rows predate listed-price tracking: the charged price is the best proxy.
    db.exec('UPDATE sale_items SET unit_price_listed = unit_price WHERE unit_price_listed IS NULL')

    // Rebuild the whole-XAF guard triggers to include the two new money columns.
    const guard = SALE_ITEM_MONEY_COLUMNS.map(
      (col) => `(NEW.${col} IS NOT NULL AND NEW.${col} <> round(NEW.${col}))`,
    ).join(' OR ')
    const message = 'sale_items: money amounts must be whole XAF'
    for (const event of ['INSERT', 'UPDATE'] as const) {
      const name = `trg_sale_items_whole_xaf_${event.toLowerCase()}`
      db.exec(`DROP TRIGGER IF EXISTS ${name}`)
      db.exec(
        `CREATE TRIGGER ${name} BEFORE ${event} ON sale_items FOR EACH ROW WHEN ${guard} ` +
          `BEGIN SELECT RAISE(ABORT, '${message}'); END`,
      )
    }
  },
}
