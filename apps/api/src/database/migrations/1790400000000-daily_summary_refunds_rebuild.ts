import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Ruling R4 (docs/design/domain-package.md): a refund reduces the revenue of the day it
 * happens by the value actually charged for the returned goods, and gives back the cost of
 * the items put back into stock. Until now the daily summary ignored refunds entirely.
 *
 * 1. `total_refunds` — the refunded goods value subtracted from that day's revenue.
 * 2. `daily_sale_summary_rebuilds` — one row per summary this migration changed, with the
 *    figures before and after, so the size of the correction can be reported.
 * 3. A one-time rebuild of total_revenue / total_cost / gross_profit / total_refunds for
 *    every summary, from source, on the rule the code applies from now on:
 *      sold on the day (COMPLETED, PARTIALLY_REFUNDED, REFUNDED sales, keyed by sale_date)
 *      minus the refunds made on the day (keyed by the return's UTC date).
 *    The per-return rounding mirrors @biztrack/domain's refundProfitImpact.
 *
 * The cash side (total_transacted and the tender columns) is not touched.
 */
export class DailySummaryRefundsRebuild1790400000000 implements MigrationInterface {
  name = 'DailySummaryRefundsRebuild1790400000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "daily_sale_summaries"
        ADD COLUMN IF NOT EXISTS "total_refunds" numeric(14,2) NOT NULL DEFAULT 0
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "daily_sale_summary_rebuilds" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "rebuild" character varying(60) NOT NULL,
        "business_id" uuid NOT NULL,
        "summary_date" date NOT NULL,
        "revenue_before" numeric(14,2) NOT NULL,
        "revenue_after" numeric(14,2) NOT NULL,
        "cost_before" numeric(14,2) NOT NULL,
        "cost_after" numeric(14,2) NOT NULL,
        "gross_profit_before" numeric(14,2) NOT NULL,
        "gross_profit_after" numeric(14,2) NOT NULL,
        "refunds" numeric(14,2) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_daily_sale_summary_rebuilds" PRIMARY KEY ("id")
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_daily_sale_summary_rebuilds_business"
        ON "daily_sale_summary_rebuilds" ("business_id", "summary_date")
    `)

    // What each summary should hold under R4.
    await queryRunner.query(`
      CREATE TEMP TABLE "tmp_r4_summary_target" ON COMMIT DROP AS
      WITH sold AS (
        SELECT s."business_id" AS business_id,
               s."sale_date"   AS day,
               COALESCE(SUM(si."line_total"), 0) AS revenue,
               COALESCE(SUM(COALESCE(si."cost_price", 0) * si."quantity"), 0) AS cost
        FROM "sales" s
        JOIN "sale_items" si ON si."sale_id" = s."id" AND si."deleted_at" IS NULL
        WHERE s."status" IN ('COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED')
          AND s."deleted_at" IS NULL
        GROUP BY s."business_id", s."sale_date"
      ),
      per_return AS (
        SELECT r."id" AS return_id,
               r."business_id" AS business_id,
               (r."created_at" AT TIME ZONE 'UTC')::date AS day,
               ROUND(SUM(
                 CASE WHEN si."quantity" > 0 THEN si."line_total" / si."quantity"
                      ELSE si."line_total" END * ri."quantity"
               )) AS revenue,
               ROUND(SUM(
                 CASE WHEN r."restock" THEN COALESCE(si."cost_price", 0) * ri."quantity"
                      ELSE 0 END
               )) AS cost
        FROM "sale_return_items" ri
        JOIN "sale_returns" r ON r."id" = ri."sale_return_id"
        JOIN "sale_items" si ON si."id" = ri."sale_item_id"
        JOIN "sales" s ON s."id" = r."sale_id"
        WHERE s."status" <> 'VOIDED' AND s."deleted_at" IS NULL
        GROUP BY r."id", r."business_id", (r."created_at" AT TIME ZONE 'UTC')::date
      ),
      refunded AS (
        SELECT business_id, day, SUM(revenue) AS revenue, SUM(cost) AS cost
        FROM per_return GROUP BY business_id, day
      ),
      days AS (
        SELECT business_id, day FROM sold
        UNION SELECT business_id, day FROM refunded
        UNION SELECT "business_id", "summary_date" FROM "daily_sale_summaries"
      )
      SELECT d.business_id,
             d.day,
             ROUND(COALESCE(sold.revenue, 0)) - COALESCE(refunded.revenue, 0) AS revenue,
             ROUND(COALESCE(sold.cost, 0)) - COALESCE(refunded.cost, 0) AS cost,
             COALESCE(refunded.revenue, 0) AS refunds
      FROM days d
      LEFT JOIN sold ON sold.business_id = d.business_id AND sold.day = d.day
      LEFT JOIN refunded ON refunded.business_id = d.business_id AND refunded.day = d.day
    `)

    // A day that only has refunds has no summary row yet.
    await queryRunner.query(`
      INSERT INTO "daily_sale_summaries" (
        "business_id", "summary_date", "total_sales", "total_revenue", "total_transacted",
        "total_cost", "gross_profit", "total_discounts", "cash_collected", "mtn_momo_collected",
        "orange_money_collected", "card_collected", "credit_issued", "credit_sales",
        "voided_sales", "voided_amount", "updated_at"
      )
      SELECT t.business_id, t.day, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, now()
      FROM "tmp_r4_summary_target" t
      WHERE t.refunds <> 0
      ON CONFLICT ("business_id", "summary_date") DO NOTHING
    `)

    // The report: every summary whose figures change, before and after.
    await queryRunner.query(`
      INSERT INTO "daily_sale_summary_rebuilds" (
        "rebuild", "business_id", "summary_date", "revenue_before", "revenue_after",
        "cost_before", "cost_after", "gross_profit_before", "gross_profit_after", "refunds"
      )
      SELECT 'R4_REFUNDS_1790400000000', d."business_id", d."summary_date",
             d."total_revenue", t.revenue, d."total_cost", t.cost,
             d."gross_profit", t.revenue - t.cost, t.refunds
      FROM "daily_sale_summaries" d
      JOIN "tmp_r4_summary_target" t
        ON t.business_id = d."business_id" AND t.day = d."summary_date"
      WHERE d."total_revenue" <> t.revenue
         OR d."total_cost" <> t.cost
         OR d."gross_profit" <> t.revenue - t.cost
    `)

    await queryRunner.query(`
      UPDATE "daily_sale_summaries" d
      SET "total_revenue" = t.revenue,
          "total_cost" = t.cost,
          "gross_profit" = t.revenue - t.cost,
          "total_refunds" = t.refunds,
          "updated_at" = now()
      FROM "tmp_r4_summary_target" t
      WHERE t.business_id = d."business_id" AND t.day = d."summary_date"
    `)

    const [report] = (await queryRunner.query(`
      SELECT COUNT(*) AS summaries,
             COUNT(DISTINCT "business_id") AS businesses,
             COALESCE(SUM("revenue_after" - "revenue_before"), 0) AS revenue_change,
             COALESCE(SUM("cost_after" - "cost_before"), 0) AS cost_change,
             COALESCE(SUM("gross_profit_after" - "gross_profit_before"), 0) AS profit_change
      FROM "daily_sale_summary_rebuilds"
      WHERE "rebuild" = 'R4_REFUNDS_1790400000000'
    `)) as Array<Record<string, string>>
    // The size of the correction, in the deploy log. The per-day detail stays in
    // daily_sale_summary_rebuilds.
    // eslint-disable-next-line no-console -- one-time migration report for the deploy log
    console.log(
      `[R4 rebuild] ${report?.summaries ?? 0} daily summaries changed across ` +
        `${report?.businesses ?? 0} businesses: revenue ${report?.revenue_change ?? 0}, ` +
        `cost of goods ${report?.cost_change ?? 0}, gross profit ${report?.profit_change ?? 0} XAF`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // The rebuilt figures are not restored: the before-values stay in the report table.
    await queryRunner.query(
      `ALTER TABLE "daily_sale_summaries" DROP COLUMN IF EXISTS "total_refunds"`,
    )
  }
}
