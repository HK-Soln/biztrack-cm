import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Low-stock producer (BIZ-4.5): per-product alert suppression + the sync-stale system
 * notification type. `reorder_alert_log` records when a product was last included in a
 * dispatched reorder notification, so the daily scan doesn't re-notify within the window.
 */
export class ReorderAlertLog1786400000000 implements MigrationInterface {
  name = 'ReorderAlertLog1786400000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'sync_stale'`,
    )
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "reorder_alert_log" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "business_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "alerted_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "pk_reorder_alert_log" PRIMARY KEY ("id")
      )
    `)
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "unq_reorder_alert_log_business_product"
       ON "reorder_alert_log" ("business_id", "product_id")`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "reorder_alert_log"`)
    // PostgreSQL cannot remove the 'sync_stale' enum value; it is left in place.
  }
}
