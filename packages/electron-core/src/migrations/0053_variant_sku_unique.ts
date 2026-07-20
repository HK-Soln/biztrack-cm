import type { Migration } from './runner'

/**
 * Mirror the API's variant-SKU uniqueness (apps/api/.../1783700000000-variant_sku_unique.ts):
 * a variant's SKU doubles as the tile "code" that identifies size/colour/price, so scanning or
 * searching a code must resolve to exactly one variant. Partial unique index — only non-null,
 * non-deleted SKUs are constrained; variants without a code are unaffected. Safe to add: variant
 * SKU was never enterable before, so no local rows conflict.
 */
export const migration_0053: Migration = {
  id: 53,
  name: '0053_variant_sku_unique',
  up(db) {
    db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS unq_product_variants_business_sku
       ON product_variants (business_id, sku)
       WHERE sku IS NOT NULL AND is_deleted = 0`,
    )
  },
}
