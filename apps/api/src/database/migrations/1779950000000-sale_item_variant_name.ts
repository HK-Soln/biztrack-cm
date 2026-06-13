import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Phase 3D — snapshot the variant name on sale_items so receipts and sales
 * history stay correct even if the variant is later renamed or removed.
 * (variant_id was added in the Phase 3C variant migration.)
 */
export class SaleItemVariantName1779950000000 implements MigrationInterface {
  name = 'SaleItemVariantName1779950000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sale_items"
      ADD COLUMN IF NOT EXISTS "variant_name" character varying(200)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sale_items" DROP COLUMN IF EXISTS "variant_name"`)
  }
}
