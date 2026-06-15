import type { Migration } from './runner'
import { ensureColumn } from './runner'

/** Local mirror: product SEO meta + per-variant denormalised stock. */
export const migration_0036: Migration = {
  id: 36,
  name: '0036_product_meta_variant_stock',
  up(db) {
    ensureColumn(db, 'products', 'meta_title', 'meta_title TEXT')
    ensureColumn(db, 'products', 'meta_description', 'meta_description TEXT')
    ensureColumn(db, 'product_variants', 'stock_quantity', 'stock_quantity INTEGER NOT NULL DEFAULT 0')
    ensureColumn(db, 'product_variants', 'low_stock_threshold', 'low_stock_threshold INTEGER')
  },
}
