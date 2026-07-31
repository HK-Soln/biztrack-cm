import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Product images can belong to a specific variant (variants are mini-products with their own
 * gallery). Nullable `variant_id` — null = product-level image. FK → product_variants with
 * ON DELETE CASCADE so a variant's images go when the variant is hard-deleted.
 */
export class ProductImageVariant1783900000000 implements MigrationInterface {
  name = 'ProductImageVariant1783900000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product_images" ADD COLUMN IF NOT EXISTS "variant_id" uuid`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_product_images_variant_id" ON "product_images" ("variant_id")`,
    )
    await queryRunner.query(
      `ALTER TABLE "product_images" ADD CONSTRAINT "fk_product_images_variant_id"
       FOREIGN KEY ("variant_id") REFERENCES "product_variants" ("id") ON DELETE CASCADE`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product_images" DROP CONSTRAINT IF EXISTS "fk_product_images_variant_id"`,
    )
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_product_images_variant_id"`)
    await queryRunner.query(`ALTER TABLE "product_images" DROP COLUMN IF EXISTS "variant_id"`)
  }
}
