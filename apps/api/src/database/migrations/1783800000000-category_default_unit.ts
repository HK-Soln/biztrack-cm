import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Categories carry a default unit of measure, pre-filled when creating a product in the
 * category. Nullable; ON DELETE SET NULL so removing a unit never orphans a category.
 */
export class CategoryDefaultUnit1783800000000 implements MigrationInterface {
  name = 'CategoryDefaultUnit1783800000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product_categories" ADD COLUMN IF NOT EXISTS "default_unit_of_measure_id" uuid`,
    )
    await queryRunner.query(
      `ALTER TABLE "product_categories" ADD CONSTRAINT "fk_product_categories_default_unit"
       FOREIGN KEY ("default_unit_of_measure_id") REFERENCES "unit_of_measures" ("id") ON DELETE SET NULL`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product_categories" DROP CONSTRAINT IF EXISTS "fk_product_categories_default_unit"`,
    )
    await queryRunner.query(
      `ALTER TABLE "product_categories" DROP COLUMN IF EXISTS "default_unit_of_measure_id"`,
    )
  }
}
