import type { Migration } from './runner'

/**
 * Phase 3E — mirror the product type locally so the sell screen knows which
 * products accept decimal quantities (VARIABLE_QUANTITY) vs whole units only.
 *
 * Quantity columns are already REAL (inventory_levels / sale_items /
 * restock_items / inventory_movements), and SQLite's INTEGER affinity preserves
 * decimals, so no quantity column changes are needed.
 */
export const migration_0026: Migration = {
  id: 26,
  name: '0026_product_type',
  up(db) {
    db.exec(`
      ALTER TABLE products ADD COLUMN product_type TEXT NOT NULL DEFAULT 'SIMPLE';
    `)
  },
}
