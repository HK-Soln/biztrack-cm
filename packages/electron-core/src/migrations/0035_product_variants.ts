import type { Migration } from './runner'

/** Local mirror of product variants + their attribute-option links (client-generated). */
export const migration_0035: Migration = {
  id: 35,
  name: '0035_product_variants',
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
      CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id, is_deleted);
      CREATE INDEX IF NOT EXISTS idx_product_variants_business ON product_variants(business_id, is_deleted);

      CREATE TABLE IF NOT EXISTS product_variant_options (
        id                 TEXT PRIMARY KEY,
        business_id        TEXT NOT NULL,
        variant_id         TEXT NOT NULL,
        attribute_group_id TEXT NOT NULL,
        attribute_option_id TEXT NOT NULL,
        is_deleted         INTEGER NOT NULL DEFAULT 0,
        created_at         TEXT NOT NULL,
        updated_at         TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_pvo_variant ON product_variant_options(variant_id, is_deleted);
      CREATE INDEX IF NOT EXISTS idx_pvo_business ON product_variant_options(business_id, is_deleted);
    `)
  },
}
