import type { Migration } from './runner'

/**
 * Phase 3F — local mirror of composite (bundle) product components. Pulled from
 * the API so the sell screen can compute "can make" and deduct component stock
 * offline.
 */
export const migration_0027: Migration = {
  id: 27,
  name: '0027_bundle_components',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS product_bundle_components (
        id                   TEXT PRIMARY KEY,
        business_id          TEXT NOT NULL,
        bundle_product_id    TEXT NOT NULL,
        component_product_id TEXT NOT NULL,
        quantity             REAL NOT NULL DEFAULT 1,
        sort_order           INTEGER NOT NULL DEFAULT 0,
        is_deleted           INTEGER NOT NULL DEFAULT 0,
        created_at           TEXT NOT NULL,
        updated_at           TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_bundle_components_bundle
        ON product_bundle_components(bundle_product_id, is_deleted);
      CREATE INDEX IF NOT EXISTS idx_bundle_components_component
        ON product_bundle_components(component_product_id, is_deleted);
    `)
  },
}
