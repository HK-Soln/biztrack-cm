import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Spec 10 slice ① — the Other Income ledger. `income_categories` (mirrors expense_categories; null
 * business_id = system/global) + `other_incomes` (non-trading income: general payment-link settlements,
 * deposit-cancellation charges, manual entries). Seeds system categories and backfills the existing
 * "other income" source — deposit-cancellation charges (savings_transactions type='charge') — into
 * other_incomes so the income statement can read the line from one place.
 */
export class OtherIncome1789200000000 implements MigrationInterface {
  name = 'OtherIncome1789200000000'

  // Deterministic ids for the seeded system categories.
  private static readonly CAT_DELIVERY = '00000000-0000-4000-a000-0000000000d1'
  private static readonly CAT_DEPOSIT = '00000000-0000-4000-a000-0000000000d2'
  private static readonly CAT_MISC = '00000000-0000-4000-a000-0000000000d3'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "income_categories" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "business_id" uuid,
        "name" character varying(100) NOT NULL,
        "slug" character varying(110) NOT NULL,
        "color" character varying(7) NOT NULL,
        "icon" character varying(50),
        "sort_order" integer NOT NULL DEFAULT 0,
        CONSTRAINT "pk_income_categories" PRIMARY KEY ("id"),
        CONSTRAINT "fk_income_categories_business_id" FOREIGN KEY ("business_id")
          REFERENCES "businesses"("id") ON DELETE CASCADE
      )
    `)
    await queryRunner.query(
      `CREATE INDEX "idx_income_categories_business_id" ON "income_categories" ("business_id")`,
    )

    await queryRunner.query(`
      CREATE TABLE "other_incomes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "business_id" uuid NOT NULL,
        "recorded_by_id" uuid,
        "category_id" uuid NOT NULL,
        "description" character varying NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "currency" character varying NOT NULL DEFAULT 'XAF',
        "payment_method" character varying,
        "reference" character varying,
        "source" character varying NOT NULL DEFAULT 'MANUAL',
        "source_id" uuid,
        "note" text,
        "date" date NOT NULL,
        "business_date" date,
        "posting_date" date,
        "is_late_arrival" boolean NOT NULL DEFAULT false,
        "original_period_id" uuid,
        CONSTRAINT "pk_other_incomes" PRIMARY KEY ("id"),
        CONSTRAINT "fk_other_incomes_business_id" FOREIGN KEY ("business_id")
          REFERENCES "businesses"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_other_incomes_recorded_by_id" FOREIGN KEY ("recorded_by_id")
          REFERENCES "users"("id") ON DELETE NO ACTION,
        CONSTRAINT "fk_other_incomes_category_id" FOREIGN KEY ("category_id")
          REFERENCES "income_categories"("id") ON DELETE NO ACTION
      )
    `)
    await queryRunner.query(
      `CREATE INDEX "idx_other_incomes_business_id_deleted_at" ON "other_incomes" ("business_id", "deleted_at")`,
    )
    await queryRunner.query(
      `CREATE INDEX "idx_other_incomes_business_id_date" ON "other_incomes" ("business_id", "date")`,
    )

    // Seed system income categories (business_id NULL → shared across every business).
    await queryRunner.query(`
      INSERT INTO "income_categories" ("id", "business_id", "name", "slug", "color", "icon", "sort_order")
      VALUES
        ('${OtherIncome1789200000000.CAT_DELIVERY}', NULL, 'Delivery fees', 'delivery-fees', '#0EA5E9', NULL, 10),
        ('${OtherIncome1789200000000.CAT_DEPOSIT}', NULL, 'Deposit charges', 'deposit-charges', '#8B5CF6', NULL, 20),
        ('${OtherIncome1789200000000.CAT_MISC}', NULL, 'Miscellaneous', 'miscellaneous', '#64748B', NULL, 30)
      ON CONFLICT ("id") DO NOTHING
    `)

    // Backfill: every existing deposit-cancellation charge becomes an other_income entry (the savings
    // ledger keeps its own 'charge' row as a deposit movement; income recognition now lives here).
    await queryRunner.query(`
      INSERT INTO "other_incomes" (
        "business_id", "recorded_by_id", "category_id", "description", "amount", "currency",
        "payment_method", "reference", "source", "source_id", "date", "business_date", "posting_date",
        "created_at"
      )
      SELECT
        st."business_id",
        st."recorded_by_id",
        '${OtherIncome1789200000000.CAT_DEPOSIT}',
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
        st."created_at"
      FROM "savings_transactions" st
      WHERE st."type" = 'charge' AND st."is_deleted" = false
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "other_incomes"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "income_categories"`)
  }
}
