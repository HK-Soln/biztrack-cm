import type { Migration } from './runner'

/**
 * Brands & Models (local mirror of the API schema). A brand links to categories
 * many-to-many (brand_categories) and owns models. Pulled + pushed via sync.
 */
export const migration_0031: Migration = {
  id: 31,
  name: '0031_brands_models',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS brands (
        id          TEXT PRIMARY KEY,
        business_id TEXT NOT NULL,
        name        TEXT NOT NULL,
        slug        TEXT NOT NULL,
        logo_url    TEXT,
        description TEXT,
        is_active   INTEGER NOT NULL DEFAULT 1,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        is_deleted  INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_brands_business ON brands(business_id, is_deleted);

      CREATE TABLE IF NOT EXISTS models (
        id          TEXT PRIMARY KEY,
        business_id TEXT NOT NULL,
        brand_id    TEXT NOT NULL,
        name        TEXT NOT NULL,
        slug        TEXT,
        is_active   INTEGER NOT NULL DEFAULT 1,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        is_deleted  INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_models_brand ON models(brand_id, is_deleted);
      CREATE INDEX IF NOT EXISTS idx_models_business ON models(business_id, is_deleted);

      CREATE TABLE IF NOT EXISTS brand_categories (
        id          TEXT PRIMARY KEY,
        business_id TEXT NOT NULL,
        brand_id    TEXT NOT NULL,
        category_id TEXT NOT NULL,
        is_deleted  INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_brand_categories_brand ON brand_categories(brand_id, is_deleted);
      CREATE INDEX IF NOT EXISTS idx_brand_categories_business ON brand_categories(business_id, is_deleted);
    `)
  },
}
