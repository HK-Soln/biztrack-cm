import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * BIZ-4.1 (D7) — align `daily_sale_summaries` to the Income-Statement profit basis.
 *
 * Canonical revenue = Σ `sale_items.line_total` (net of line + allocated cart discounts, EXCLUDING
 * sale-level charges). This is what `SalesService.getGrossProfit` — and therefore the owner digest
 * and the income statement — already use. The summary writer, however, stored
 * `total_revenue = sale.total_amount` (subtotal − discount + charges), so `getPnlSummary` and the
 * daily-summary endpoint disagreed with the digest for any sale carrying charges.
 *
 * The cash-close reconciliation compares a shift's `SUM(sales.total_amount)` against the day's
 * posted summary, so it still needs the *transaction* total. We keep that in a new
 * `total_transacted` column and repoint reconciliation at it, freeing `total_revenue` to become the
 * accounting figure.
 *
 * API-only (daily_sale_summaries is Postgres-only — no SQLite copy).
 */
export class AlignDailySummaryRevenue1787300000000 implements MigrationInterface {
  name = 'AlignDailySummaryRevenue1787300000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. New column: the transaction total (Σ sale.total_amount, incl. charges) for reconciliation.
    await queryRunner.query(`
      ALTER TABLE "daily_sale_summaries"
        ADD COLUMN IF NOT EXISTS "total_transacted" numeric(14,2) NOT NULL DEFAULT 0
    `)

    // 2. Seed it from the current total_revenue — which, pre-migration, IS the transaction total.
    await queryRunner.query(`
      UPDATE "daily_sale_summaries" SET "total_transacted" = "total_revenue"
    `)

    // 3. Recompute total_revenue + gross_profit onto the Σ line_total basis for every historical
    //    row, from the source-of-truth completed sales. total_cost is unchanged.
    await queryRunner.query(`
      UPDATE "daily_sale_summaries" d
      SET "total_revenue" = sub.rev,
          "gross_profit" = round(sub.rev - d."total_cost")
      FROM (
        SELECT s."business_id" AS business_id,
               s."sale_date"  AS sale_date,
               COALESCE(SUM(si."line_total"), 0) AS rev
        FROM "sales" s
        JOIN "sale_items" si ON si."sale_id" = s."id"
        WHERE s."status" = 'COMPLETED' AND s."deleted_at" IS NULL
        GROUP BY s."business_id", s."sale_date"
      ) sub
      WHERE d."business_id" = sub.business_id AND d."summary_date" = sub.sale_date
    `)

    // 4. Whole-XAF CHECK on the new column, matching the BIZ-0.2 convention.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'chk_daily_sale_summaries_total_transacted_whole_xaf'
        ) THEN
          ALTER TABLE "daily_sale_summaries"
            ADD CONSTRAINT "chk_daily_sale_summaries_total_transacted_whole_xaf"
            CHECK ("total_transacted" IS NULL OR "total_transacted" = round("total_transacted"));
        END IF;
      END $$;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore total_revenue to the transaction basis from the preserved column, then drop it.
    await queryRunner.query(`
      UPDATE "daily_sale_summaries"
      SET "total_revenue" = "total_transacted",
          "gross_profit" = round("total_transacted" - "total_cost")
    `)
    await queryRunner.query(`
      ALTER TABLE "daily_sale_summaries"
        DROP CONSTRAINT IF EXISTS "chk_daily_sale_summaries_total_transacted_whole_xaf"
    `)
    await queryRunner.query(`
      ALTER TABLE "daily_sale_summaries" DROP COLUMN IF EXISTS "total_transacted"
    `)
  }
}
