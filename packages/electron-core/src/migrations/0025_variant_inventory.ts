import type { Migration } from './runner'

/**
 * Phase 3D — per-variant inventory on the device.
 *
 * inventory_levels previously had product_id UNIQUE (one row per product). With
 * variants there is one row per (product, variant), so the table is recreated
 * without that constraint and gains two partial unique indexes mirroring the API.
 * sale_items gains variant_name (snapshot for receipts).
 */
export const migration_0025: Migration = {
  id: 25,
  name: '0025_variant_inventory',
  up(db) {
    db.exec(`
      CREATE TABLE inventory_levels_new (
        id                  TEXT PRIMARY KEY,
        business_id         TEXT NOT NULL,
        product_id          TEXT NOT NULL,
        variant_id          TEXT,
        quantity            REAL NOT NULL DEFAULT 0,
        low_stock_threshold REAL,
        reorder_point       REAL,
        last_restock_at     TEXT,
        created_at          TEXT NOT NULL,
        updated_at          TEXT NOT NULL
      );

      INSERT INTO inventory_levels_new (
        id, business_id, product_id, variant_id, quantity,
        low_stock_threshold, reorder_point, last_restock_at, created_at, updated_at
      )
      SELECT
        id, business_id, product_id, variant_id, quantity,
        low_stock_threshold, reorder_point, last_restock_at, created_at, updated_at
      FROM inventory_levels;

      DROP TABLE inventory_levels;
      ALTER TABLE inventory_levels_new RENAME TO inventory_levels;

      CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_no_variant
        ON inventory_levels(business_id, product_id)
        WHERE variant_id IS NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_with_variant
        ON inventory_levels(business_id, product_id, variant_id)
        WHERE variant_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_inventory_levels_variant
        ON inventory_levels(variant_id);

      ALTER TABLE sale_items ADD COLUMN variant_name TEXT;
    `)
  },
}
