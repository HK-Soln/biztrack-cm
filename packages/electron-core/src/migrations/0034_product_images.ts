import type { Migration } from './runner'

/** Local mirror of product gallery images (main image stays on products.image_url). */
export const migration_0034: Migration = {
  id: 34,
  name: '0034_product_images',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS product_images (
        id          TEXT PRIMARY KEY,
        business_id TEXT,
        product_id  TEXT NOT NULL,
        url         TEXT NOT NULL,
        alt_text    TEXT,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        is_deleted  INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id, is_deleted);
      CREATE INDEX IF NOT EXISTS idx_product_images_business ON product_images(business_id, is_deleted);
    `)
  },
}
