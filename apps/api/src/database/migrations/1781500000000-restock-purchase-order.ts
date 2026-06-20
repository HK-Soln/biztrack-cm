import { MigrationInterface, QueryRunner } from 'typeorm'

/** Link a restock (goods receipt) to the purchase order it fulfils. */
export class RestockPurchaseOrder1781500000000 implements MigrationInterface {
  name = 'RestockPurchaseOrder1781500000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "restock_records" ADD COLUMN IF NOT EXISTS "purchase_order_id" uuid`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_restock_records_purchase_order_id" ON "restock_records" ("purchase_order_id")`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_restock_records_purchase_order_id"`)
    await queryRunner.query(`ALTER TABLE "restock_records" DROP COLUMN IF EXISTS "purchase_order_id"`)
  }
}
