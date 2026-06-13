import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Phase 3A — category hierarchy.
 *
 * Adds self-referential nesting to product_categories. image_url and sort_order
 * already exist (products_inventory_v2), so this only adds parent_id + depth.
 *
 * depth is constrained to 1..3; the parent-must-be-depth-1 invariant is enforced
 * in the application layer (too complex for a DB check).
 */
export class CategoryHierarchy1779700000000 implements MigrationInterface {
  name = 'CategoryHierarchy1779700000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_categories"
      ADD COLUMN IF NOT EXISTS "parent_id" uuid,
      ADD COLUMN IF NOT EXISTS "depth" smallint NOT NULL DEFAULT 1
    `)

    await queryRunner.query(`
      ALTER TABLE "product_categories"
      ADD CONSTRAINT "chk_product_categories_depth" CHECK ("depth" BETWEEN 1 AND 3)
    `)

    await queryRunner.query(`
      ALTER TABLE "product_categories"
      ADD CONSTRAINT "fk_product_categories_parent_id"
      FOREIGN KEY ("parent_id") REFERENCES "product_categories"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_product_categories_parent_id"
      ON "product_categories" ("parent_id")
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_product_categories_business_id_depth"
      ON "product_categories" ("business_id", "depth")
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_product_categories_business_id_depth"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_product_categories_parent_id"`)
    await queryRunner.query(
      `ALTER TABLE "product_categories" DROP CONSTRAINT IF EXISTS "fk_product_categories_parent_id"`,
    )
    await queryRunner.query(
      `ALTER TABLE "product_categories" DROP CONSTRAINT IF EXISTS "chk_product_categories_depth"`,
    )
    await queryRunner.query(`ALTER TABLE "product_categories" DROP COLUMN IF EXISTS "depth"`)
    await queryRunner.query(`ALTER TABLE "product_categories" DROP COLUMN IF EXISTS "parent_id"`)
  }
}
