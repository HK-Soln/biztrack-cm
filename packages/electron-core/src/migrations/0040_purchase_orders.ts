import type { Migration } from './runner'

/**
 * Purchase Orders (POs) — the formal order placed with one supplier, optionally created
 * from a chosen RFQ quote. A PO has line items with agreed unit prices and tracks how
 * much of each has been received (so a restock can fill against it). Mirrors the API
 * purchase_orders schema for offline-first.
 */
export const migration_0040: Migration = {
  id: 40,
  name: '0040_purchase_orders',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS purchase_orders (
        id            TEXT PRIMARY KEY,
        business_id   TEXT NOT NULL,
        number        TEXT NOT NULL,
        rfq_id        TEXT,
        supplier_id   TEXT NOT NULL,
        supplier_name TEXT,
        title         TEXT,
        message_body  TEXT,
        status        TEXT NOT NULL DEFAULT 'DRAFT',
        currency      TEXT NOT NULL DEFAULT 'XAF',
        expected_date TEXT,
        total_amount  REAL NOT NULL DEFAULT 0,
        sent_at       TEXT,
        created_by_id TEXT,
        is_deleted    INTEGER NOT NULL DEFAULT 0,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_purchase_orders_business
        ON purchase_orders(business_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_purchase_orders_business_status
        ON purchase_orders(business_id, status);

      CREATE TABLE IF NOT EXISTS purchase_order_items (
        id                 TEXT PRIMARY KEY,
        purchase_order_id  TEXT NOT NULL,
        product_id         TEXT NOT NULL,
        variant_id         TEXT,
        description        TEXT NOT NULL,
        quantity           REAL NOT NULL,
        unit_price         REAL NOT NULL DEFAULT 0,
        received_quantity  REAL NOT NULL DEFAULT 0,
        created_at         TEXT NOT NULL,
        FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_po_items_po ON purchase_order_items(purchase_order_id);
    `)
  },
}
