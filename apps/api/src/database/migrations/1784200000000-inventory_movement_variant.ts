import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Per-variant stock movements: tag each movement with the variant it affected (null = product
 * level) so a variant's own stock history can be listed. Nullable; existing rows stay product-level.
 */
export class InventoryMovementVariant1784200000000 implements MigrationInterface {
  name = 'InventoryMovementVariant1784200000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "inventory_movements" ADD COLUMN IF NOT EXISTS "variant_id" uuid`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_inventory_movements_business_id_variant_id" ON "inventory_movements" ("business_id", "variant_id")`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_inventory_movements_business_id_variant_id"`)
    await queryRunner.query(`ALTER TABLE "inventory_movements" DROP COLUMN IF EXISTS "variant_id"`)
  }
}
