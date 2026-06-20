import type { Migration } from './runner'

/**
 * Requests for Quotation (RFQs) — the first step of procurement: ask one or more
 * suppliers to quote a list of items. An RFQ has line items (products/variants) and
 * a set of suppliers it was sent to, each of which can return a quote. A chosen quote
 * later converts to a Purchase Order. Mirrors the API rfqs schema for offline-first.
 */
export const migration_0039: Migration = {
  id: 39,
  name: '0039_rfqs',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS rfqs (
        id            TEXT PRIMARY KEY,
        business_id   TEXT NOT NULL,
        number        TEXT NOT NULL,
        title         TEXT,
        message_body  TEXT,
        status        TEXT NOT NULL DEFAULT 'DRAFT',
        currency      TEXT NOT NULL DEFAULT 'XAF',
        created_by_id TEXT,
        is_deleted    INTEGER NOT NULL DEFAULT 0,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_rfqs_business
        ON rfqs(business_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_rfqs_business_status
        ON rfqs(business_id, status);

      CREATE TABLE IF NOT EXISTS rfq_items (
        id          TEXT PRIMARY KEY,
        rfq_id      TEXT NOT NULL,
        product_id  TEXT NOT NULL,
        variant_id  TEXT,
        description TEXT NOT NULL,
        quantity    REAL NOT NULL,
        created_at  TEXT NOT NULL,
        FOREIGN KEY (rfq_id) REFERENCES rfqs(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_rfq_items_rfq ON rfq_items(rfq_id);

      CREATE TABLE IF NOT EXISTS rfq_suppliers (
        id           TEXT PRIMARY KEY,
        rfq_id       TEXT NOT NULL,
        supplier_id  TEXT NOT NULL,
        supplier_name TEXT,
        status       TEXT NOT NULL DEFAULT 'PENDING',
        quoted_total REAL,
        quote_notes  TEXT,
        responded_at TEXT,
        created_at   TEXT NOT NULL,
        FOREIGN KEY (rfq_id) REFERENCES rfqs(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_rfq_suppliers_rfq ON rfq_suppliers(rfq_id);
    `)
  },
}
