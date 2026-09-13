import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Idempotent reconcile: book any deposit-cancellation charge (savings_transactions type='charge')
 * that does NOT yet have a matching Other Income row. The first backfill lived inside the
 * other_income table-creation migration (1789200000000) and only saw charges that existed then; a
 * device-originated charge synced afterwards (before the sync path started booking income) would have
 * a savings 'charge' row but no other_incomes row, so the income statement — which now reads other
 * income only from other_incomes — would under-report. This catches every such gap.
 *
 * Idempotent by design: the NOT EXISTS on (source='DEPOSIT_CHARGE', source_id=txn.id) means an
 * already-booked charge is skipped, so re-running (or running alongside going-forward booking in
 * settle()/the sync path) never duplicates. The business's own per-business "Deposit charges"
 * category is resolved by slug (falling back to "Miscellaneous"); a business with neither seeded yet
 * is skipped and picked up on a later run. The created rows sync down to devices via the normal
 * other-income pull.
 */
export class BackfillDepositChargeIncome1790100000000 implements MigrationInterface {
  name = 'BackfillDepositChargeIncome1790100000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "other_incomes" (
        "business_id", "recorded_by_id", "category_id", "description", "amount", "currency",
        "payment_method", "reference", "source", "source_id", "date", "business_date", "posting_date",
        "created_at", "updated_at"
      )
      SELECT
        st."business_id",
        st."recorded_by_id",
        COALESCE(
          (SELECT ic."id" FROM "income_categories" ic
             WHERE ic."business_id" = st."business_id" AND ic."slug" = 'deposit-charges'
               AND ic."deleted_at" IS NULL LIMIT 1),
          (SELECT ic."id" FROM "income_categories" ic
             WHERE ic."business_id" = st."business_id" AND ic."slug" = 'miscellaneous'
               AND ic."deleted_at" IS NULL LIMIT 1)
        ),
        COALESCE(NULLIF(st."notes", ''), 'Deposit cancellation charge'),
        st."amount",
        'XAF',
        st."method",
        st."mobile_money_reference",
        'DEPOSIT_CHARGE',
        st."id",
        COALESCE(st."business_date", (st."occurred_at" AT TIME ZONE 'UTC')::date),
        st."business_date",
        COALESCE(st."business_date", (st."occurred_at" AT TIME ZONE 'UTC')::date),
        st."created_at",
        now()
      FROM "savings_transactions" st
      WHERE st."type" = 'charge'
        AND st."is_deleted" = false
        AND NOT EXISTS (
          SELECT 1 FROM "other_incomes" oi
          WHERE oi."source" = 'DEPOSIT_CHARGE' AND oi."source_id" = st."id"
        )
        -- Only when a target category exists for the business (else skip; a later run catches it).
        AND EXISTS (
          SELECT 1 FROM "income_categories" ic
          WHERE ic."business_id" = st."business_id"
            AND ic."slug" IN ('deposit-charges', 'miscellaneous')
            AND ic."deleted_at" IS NULL
        )
    `)
  }

  public async down(): Promise<void> {
    // No-op: these rows are indistinguishable from the going-forward income bookings and removing them
    // would under-report other income.
  }
}
