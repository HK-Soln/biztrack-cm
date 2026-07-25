import type { Migration } from './runner'
import { ensureColumn } from './runner'

/**
 * Product images can belong to a specific variant (variants are mini-products with their own
 * gallery). Local mirror of the API schema — see apps/api/.../*-product_image_variant.ts.
 * Nullable: null = product-level image, set = variant image.
 */
export const migration_0055: Migration = {
  id: 55,
  name: '0055_product_image_variant',
  up(db) {
    ensureColumn(db, 'product_images', 'variant_id', 'variant_id TEXT')
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_product_images_variant ON product_images(variant_id, is_deleted)`,
    )
  },
}
