import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Slice 9 (docs/design/domain-package.md): a serialized product's stock is its serial units,
 * so its own inventory level only holds its thresholds and stays at 0
 * (@biztrack/domain newProductStockLevel). A serialized product made on a till used to arrive
 * by sync with its unit count stored on that level as well; this puts those levels back to 0.
 * Movements are history and are left as they are.
 */
export class SerializedLevelZero1790900000000 implements MigrationInterface {
  name = 'SerializedLevelZero1790900000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "inventory_levels" il
      SET "quantity" = 0
      FROM "products" p
      WHERE p."id" = il."product_id"
        AND p."is_serialized" = true
        AND il."variant_id" IS NULL
        AND il."quantity" <> 0`)
  }

  public async down(): Promise<void> {
    // The quantities removed duplicated the serial unit count; nothing to restore.
  }
}
