import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Audit finding H8 — add indexes on foreign keys / hot query paths that were
 * unindexed. Postgres does not auto-index foreign keys.
 *
 * - restock_items: both FK columns (restock_record_id, product_id) were
 *   unindexed, so loading a restock's line items and product purchase history
 *   did full table scans, and ON DELETE CASCADE triggered seq scans.
 * - sale_items: had (business_id) and (product_id) separately, but the common
 *   "units/revenue per product within a business" report needs the composite.
 */
export class AddMissingIndexes1779500000000 implements MigrationInterface {
  name = 'AddMissingIndexes1779500000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_restock_items_restock_record_id"
      ON "restock_items" ("restock_record_id")
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_restock_items_product_id"
      ON "restock_items" ("product_id")
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_sale_items_business_id_product_id"
      ON "sale_items" ("business_id", "product_id")
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_sale_items_business_id_product_id"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_restock_items_product_id"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_restock_items_restock_record_id"`)
  }
}
