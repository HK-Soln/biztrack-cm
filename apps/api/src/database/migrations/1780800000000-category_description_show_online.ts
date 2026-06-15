import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Product categories: free-text description + an online-store visibility flag.
 * `show_online` defaults to true so existing categories surface in the online
 * store without a backfill.
 */
export class CategoryDescriptionShowOnline1780800000000 implements MigrationInterface {
  name = 'CategoryDescriptionShowOnline1780800000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_categories"
        ADD COLUMN IF NOT EXISTS "description" text,
        ADD COLUMN IF NOT EXISTS "show_online" boolean NOT NULL DEFAULT true
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_categories"
        DROP COLUMN IF EXISTS "description",
        DROP COLUMN IF EXISTS "show_online"
    `)
  }
}
