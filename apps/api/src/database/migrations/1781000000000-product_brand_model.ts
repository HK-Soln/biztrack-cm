import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Link products to a brand + model (both optional). ON DELETE SET NULL so removing a
 * brand/model doesn't delete its products — they just lose the link.
 */
export class ProductBrandModel1781000000000 implements MigrationInterface {
  name = 'ProductBrandModel1781000000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
        ADD COLUMN IF NOT EXISTS "brand_id" uuid,
        ADD COLUMN IF NOT EXISTS "model_id" uuid
    `)
    await queryRunner.query(`
      ALTER TABLE "products" ADD CONSTRAINT "fk_products_brand_id"
      FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE NO ACTION
    `)
    await queryRunner.query(`
      ALTER TABLE "products" ADD CONSTRAINT "fk_products_model_id"
      FOREIGN KEY ("model_id") REFERENCES "models"("id") ON DELETE SET NULL ON UPDATE NO ACTION
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_products_brand_id" ON "products" ("brand_id")`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "fk_products_brand_id"`)
    await queryRunner.query(`ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "fk_products_model_id"`)
    await queryRunner.query(`
      ALTER TABLE "products" DROP COLUMN IF EXISTS "brand_id", DROP COLUMN IF EXISTS "model_id"
    `)
  }
}
