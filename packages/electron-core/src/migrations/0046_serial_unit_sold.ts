import type { Migration } from './runner'
import { ensureColumn } from './runner'

/** Provenance for a sold serial unit (set at checkout, mirrors the API serial-unit
 * shape): which sale consumed it, when, and for which customer. Marking status='SOLD'
 * removes it from IN_STOCK availability; these columns record the link for receipts,
 * void-reversal, and pull-apply parity. */
export const migration_0046: Migration = {
  id: 46,
  name: '0046_serial_unit_sold',
  up(db) {
    ensureColumn(db, 'product_serial_units', 'sale_id', 'TEXT')
    ensureColumn(db, 'product_serial_units', 'sale_item_id', 'TEXT')
    ensureColumn(db, 'product_serial_units', 'sold_at', 'TEXT')
    ensureColumn(db, 'product_serial_units', 'customer_id', 'TEXT')
  },
}
