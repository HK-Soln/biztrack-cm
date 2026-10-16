import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Ruling R9 (docs/design/domain-package.md): goods that came back are no longer owed for.
 * A sale's balance after a return used to be its total less what was still paid, so a sale
 * paid in full and partly refunded showed a balance equal to the refund.
 *
 * Recomputes `sales.credit_amount` of every sale with returns as
 * (total − value of the goods returned) − amount paid, never below zero. This mirrors
 * `settleSaleFromLedger` in @biztrack/domain; the value of the goods is each returned
 * quantity at the line's price per unit, as in `refundProfitImpact`.
 *
 * Debts are not touched: the server never changed a receivable on a partial return, so they
 * still hold what was owed. `updated_at` is left alone so this does not re-send every such
 * sale to the tills, which repair their own copy (desktop migration 0085).
 */
export class SaleBalanceAfterReturns1790600000000 implements MigrationInterface {
  name = 'SaleBalanceAfterReturns1790600000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    const changed = (await queryRunner.query(`
      WITH returned AS (
        SELECT r."sale_id",
               ROUND(SUM(ri."quantity" * si."line_total" / NULLIF(si."quantity", 0))) AS value
          FROM "sale_return_items" ri
          JOIN "sale_returns" r ON r."id" = ri."sale_return_id"
          JOIN "sale_items" si ON si."id" = ri."sale_item_id"
         GROUP BY r."sale_id"
      )
      UPDATE "sales" s
         SET "credit_amount" =
               GREATEST(0, s."total_amount" - COALESCE(returned.value, 0) - s."amount_paid")
        FROM returned
       WHERE returned."sale_id" = s."id"
         AND s."status" IN ('PARTIALLY_REFUNDED', 'REFUNDED')
         AND s."credit_amount" IS DISTINCT FROM
               GREATEST(0, s."total_amount" - COALESCE(returned.value, 0) - s."amount_paid")
      RETURNING s."id"
    `)) as unknown
    const rows = Array.isArray(changed) && Array.isArray(changed[0]) ? changed[0] : changed
    // eslint-disable-next-line no-console -- one-time repair: the deploy log is its report
    console.log(
      `[sale_balance_after_returns] balance recomputed on ${Array.isArray(rows) ? rows.length : 0} returned sale(s)`,
    )
  }

  public async down(): Promise<void> {
    // The earlier balances were wrong and are not kept; nothing to restore.
  }
}
