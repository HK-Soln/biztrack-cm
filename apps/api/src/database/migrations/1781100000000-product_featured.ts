import { MigrationInterface, QueryRunner } from 'typeorm'

/** 'Featured' flag — pin a product to the top of lists / online store. */
export class ProductFeatured1781100000000 implements MigrationInterface {
  name = 'ProductFeatured1781100000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "is_featured" boolean NOT NULL DEFAULT false
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "is_featured"`)
  }
}
