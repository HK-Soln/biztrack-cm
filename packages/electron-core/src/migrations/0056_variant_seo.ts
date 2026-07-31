import type { Migration } from './runner'
import { ensureColumn } from './runner'

/**
 * Variants are mini-products: give them their own description + SEO/online fields (local mirror
 * of the API schema — see apps/api/.../*-variant_seo.ts). All nullable/optional.
 */
export const migration_0056: Migration = {
  id: 56,
  name: '0056_variant_seo',
  up(db) {
    ensureColumn(db, 'product_variants', 'description', 'description TEXT')
    ensureColumn(db, 'product_variants', 'meta_title', 'meta_title TEXT')
    ensureColumn(db, 'product_variants', 'meta_description', 'meta_description TEXT')
    ensureColumn(db, 'product_variants', 'online_description', 'online_description TEXT')
    ensureColumn(
      db,
      'product_variants',
      'is_published_online',
      'is_published_online INTEGER NOT NULL DEFAULT 0',
    )
  },
}
