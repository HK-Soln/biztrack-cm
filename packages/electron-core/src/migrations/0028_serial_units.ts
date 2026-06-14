import type { Migration } from './runner'

/**
 * Phase 3G (part 2) — local mirror of serialised units. Only IN_STOCK / RESERVED
 * units are kept on the device (the sync layer drops the rest). Selling marks a
 * unit SOLD locally; the next pull removes it.
 */
export const migration_0028: Migration = {
  id: 28,
  name: '0028_serial_units',
  up(db) {
    db.exec(`
      ALTER TABLE products ADD COLUMN is_serialized INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE products ADD COLUMN serial_type TEXT;
      ALTER TABLE products ADD COLUMN warranty_months INTEGER;
      ALTER TABLE sale_items ADD COLUMN serial_unit_id TEXT;
      ALTER TABLE sale_items ADD COLUMN serial_number TEXT;

      CREATE TABLE IF NOT EXISTS product_serial_units (
        id                  TEXT PRIMARY KEY,
        business_id         TEXT NOT NULL,
        product_id          TEXT NOT NULL,
        variant_id          TEXT,
        serial_number       TEXT NOT NULL,
        serial_type         TEXT NOT NULL,
        status              TEXT NOT NULL DEFAULT 'IN_STOCK',
        purchase_price      INTEGER NOT NULL DEFAULT 0,
        warranty_expires_at TEXT,
        reserved_at         TEXT,
        reserved_by         TEXT,
        created_at          TEXT NOT NULL,
        updated_at          TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_serial_units_product
        ON product_serial_units(product_id, status);
      CREATE INDEX IF NOT EXISTS idx_serial_units_serial
        ON product_serial_units(serial_number);
    `)
  },
}
