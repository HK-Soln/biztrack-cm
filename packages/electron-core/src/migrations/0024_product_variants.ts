import type { Migration } from './runner'

/**
 * Phase 3C — local mirror of product variants.
 *
 * Variants are created/managed online and pulled to the desktop (read-only here),
 * so the product-creation form and (later) the sell screen can show them offline.
 *
 * Note: per-variant inventory levels are not synced locally in 3C. The
 * inventory_levels.product_id UNIQUE constraint stays until the sell-screen
 * phase (3D/3E) recreates the table to support one row per variant.
 */
export const migration_0024: Migration = {
  id: 24,
  name: '0024_product_variants',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS product_variants (
        id                    TEXT PRIMARY KEY,
        business_id           TEXT NOT NULL,
        product_id            TEXT NOT NULL,
        name                  TEXT NOT NULL,
        display_name_override TEXT,
        price_override        INTEGER,
        cost_price_override   INTEGER,
        sku                   TEXT,
        barcode               TEXT,
        is_active             INTEGER NOT NULL DEFAULT 1,
        sort_order            INTEGER NOT NULL DEFAULT 0,
        is_deleted            INTEGER NOT NULL DEFAULT 0,
        created_at            TEXT NOT NULL,
        updated_at            TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_product_variants_product
        ON product_variants(product_id, is_deleted);
      CREATE INDEX IF NOT EXISTS idx_product_variants_business
        ON product_variants(business_id, is_deleted);

      CREATE TABLE IF NOT EXISTS product_variant_options (
        id                  TEXT PRIMARY KEY,
        variant_id          TEXT NOT NULL,
        attribute_group_id  TEXT NOT NULL,
        attribute_option_id TEXT NOT NULL,
        business_id         TEXT NOT NULL,
        is_deleted          INTEGER NOT NULL DEFAULT 0,
        created_at          TEXT NOT NULL,
        updated_at          TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_variant_options_variant
        ON product_variant_options(variant_id, is_deleted);

      ALTER TABLE products ADD COLUMN has_variants INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE inventory_levels ADD COLUMN variant_id TEXT;
      ALTER TABLE sale_items ADD COLUMN variant_id TEXT;
      ALTER TABLE restock_items ADD COLUMN variant_id TEXT;
    `)
  },
}
