import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Make a product variant's SKU (used as the tile "code" that identifies size/colour/price)
 * unique per business, so scanning/searching a code resolves to exactly one variant.
 * Partial index: only non-null, non-deleted SKUs are constrained (variants without a code
 * are unaffected). Safe to add — variant SKU was never enterable before, so no rows conflict.
 */
export class VariantSkuUnique1783700000000 implements MigrationInterface {
  name = 'VariantSkuUnique1783700000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "unq_product_variants_business_sku"
       ON "product_variants" ("business_id", "sku")
       WHERE "sku" IS NOT NULL AND "deleted_at" IS NULL`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "unq_product_variants_business_sku"`)
  }
}
