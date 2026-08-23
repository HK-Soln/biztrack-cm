import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * BIZ-5.4 — posting_date + late-arrival tracking on the financial transaction tables (sales,
 * sale_payments, expenses).
 *
 * `business_date` (BIZ-5.1) is the transaction_date — the real operational day. `posting_date` is
 * the accounting day the transaction posts to: normally the same, but a transaction that arrives
 * (synced late) into an already-CLOSED period is redated forward to the earliest OPEN period and
 * flagged `is_late_arrival` (a prior-period adjustment), so a closed period's financial numbers
 * never silently change. `original_period_id` keeps the period it belonged to.
 *
 * Operational reports keep using business_date; financial reports use posting_date. API-only —
 * financial reporting is server-side.
 */
export class PostingDate1787200000000 implements MigrationInterface {
  private readonly tables = ['sales', 'sale_payments', 'expenses']

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of this.tables) {
      await queryRunner.query(`
        ALTER TABLE "${table}"
          ADD COLUMN IF NOT EXISTS "posting_date" date,
          ADD COLUMN IF NOT EXISTS "is_late_arrival" boolean NOT NULL DEFAULT false,
          ADD COLUMN IF NOT EXISTS "original_period_id" uuid
      `)
    }
    // Back-fill posting_date = business_date for existing rows (they posted in their own period).
    // `sale_payments` is append-only (BIZ-2.8 guard triggers reject every UPDATE), so suspend its
    // user triggers just for this one-time back-fill and restore them immediately after.
    for (const table of this.tables) {
      if (table === 'sale_payments') {
        await queryRunner.query(`ALTER TABLE "sale_payments" DISABLE TRIGGER USER`)
        await queryRunner.query(
          `UPDATE "sale_payments" SET "posting_date" = "business_date" WHERE "posting_date" IS NULL`,
        )
        await queryRunner.query(`ALTER TABLE "sale_payments" ENABLE TRIGGER USER`)
      } else {
        await queryRunner.query(
          `UPDATE "${table}" SET "posting_date" = "business_date" WHERE "posting_date" IS NULL`,
        )
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of this.tables) {
      await queryRunner.query(`
        ALTER TABLE "${table}"
          DROP COLUMN IF EXISTS "posting_date",
          DROP COLUMN IF EXISTS "is_late_arrival",
          DROP COLUMN IF EXISTS "original_period_id"
      `)
    }
  }
}
