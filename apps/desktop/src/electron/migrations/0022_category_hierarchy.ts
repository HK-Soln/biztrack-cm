import type { Migration } from './runner'
import { ensureColumn } from './runner'

/**
 * Phase 3A — category hierarchy (local mirror of the API schema).
 * Adds parent_id and depth to product_categories. sort_order already exists.
 */
export const migration_0022: Migration = {
  id: 22,
  name: '0022_category_hierarchy',
  up(db) {
    ensureColumn(db, 'product_categories', 'parent_id', 'parent_id TEXT')
    ensureColumn(db, 'product_categories', 'depth', 'depth INTEGER NOT NULL DEFAULT 1')
    ensureColumn(db, 'product_categories', 'sort_order', 'sort_order INTEGER NOT NULL DEFAULT 0')
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_product_categories_parent ON product_categories(parent_id)`,
    )
  },
}
