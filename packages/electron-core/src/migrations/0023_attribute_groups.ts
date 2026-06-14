import type { Migration } from './runner'

/**
 * Phase 3B — local mirror of attribute groups, options, and category links.
 * Pulled from the API so the product-creation form and sell screen can read
 * them offline.
 */
export const migration_0023: Migration = {
  id: 23,
  name: '0023_attribute_groups',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS attribute_groups (
        id           TEXT PRIMARY KEY,
        business_id  TEXT NOT NULL,
        name         TEXT NOT NULL,
        display_type TEXT NOT NULL DEFAULT 'CHIPS',
        sort_order   INTEGER NOT NULL DEFAULT 0,
        is_active    INTEGER NOT NULL DEFAULT 1,
        is_deleted   INTEGER NOT NULL DEFAULT 0,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_attribute_groups_business
        ON attribute_groups(business_id, is_deleted);

      CREATE TABLE IF NOT EXISTS attribute_options (
        id          TEXT PRIMARY KEY,
        group_id    TEXT NOT NULL,
        business_id TEXT NOT NULL,
        value       TEXT NOT NULL,
        color_hex   TEXT,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        is_active   INTEGER NOT NULL DEFAULT 1,
        is_deleted  INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_attribute_options_group
        ON attribute_options(group_id, is_deleted);

      CREATE TABLE IF NOT EXISTS category_attribute_groups (
        id                 TEXT PRIMARY KEY,
        business_id        TEXT NOT NULL,
        category_id        TEXT NOT NULL,
        attribute_group_id TEXT NOT NULL,
        is_required        INTEGER NOT NULL DEFAULT 1,
        sort_order         INTEGER NOT NULL DEFAULT 0,
        is_deleted         INTEGER NOT NULL DEFAULT 0,
        created_at         TEXT NOT NULL,
        updated_at         TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_cat_attr_groups_category
        ON category_attribute_groups(category_id, is_deleted);
      CREATE INDEX IF NOT EXISTS idx_cat_attr_groups_business
        ON category_attribute_groups(business_id, is_deleted);
    `)
  },
}
