import type { Migration } from './runner'
import { ensureColumn } from './runner'

/**
 * Per-variant reorder point (denormalised onto product_variants, mirroring low_stock_threshold
 * from migration 0036). A variant is a mini-product with its own stock alert thresholds.
 */
export const migration_0058: Migration = {
  id: 58,
  name: '0058_variant_reorder_point',
  up(db) {
    ensureColumn(db, 'product_variants', 'reorder_point', 'reorder_point INTEGER')
  },
}
