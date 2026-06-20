import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Make product_images sync-able: add business_id (tenant-scoped pull), updated_at
 * (cursor) and deleted_at (soft-delete). Backfill business_id from the parent product.
 */
export class ProductImageSync1781200000000 implements MigrationInterface {
  name = 'ProductImageSync1781200000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_images"
        ADD COLUMN IF NOT EXISTS "business_id" uuid,
        ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP
    `)
    await queryRunner.query(`
      UPDATE "product_images" pi SET "business_id" = p."business_id"
      FROM "products" p WHERE p."id" = pi."product_id" AND pi."business_id" IS NULL
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_product_images_business_id" ON "product_images" ("business_id")
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_product_images_business_id"`)
    await queryRunner.query(`
      ALTER TABLE "product_images"
        DROP COLUMN IF EXISTS "business_id",
        DROP COLUMN IF EXISTS "updated_at",
        DROP COLUMN IF EXISTS "deleted_at"
    `)
  }
}
