import type { Migration } from './runner'
import { ensureColumn } from './runner'

/**
 * Link a restock (goods receipt) to the purchase order it fulfils, and let restock
 * line items target a specific product variant. Enables restock-from-PO: receiving
 * against a PO updates each line's received quantity and the PO status.
 */
export const migration_0041: Migration = {
  id: 41,
  name: '0041_restock_po_variant',
  up(db) {
    ensureColumn(db, 'restock_records', 'purchase_order_id', 'TEXT')
    ensureColumn(db, 'restock_items', 'variant_id', 'TEXT')
    db.exec(`CREATE INDEX IF NOT EXISTS idx_restock_records_po ON restock_records(purchase_order_id);`)
  },
}
