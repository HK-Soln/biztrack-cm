import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * BIZ-5.2 — fiscal years + accounting periods.
 *
 * - `businesses.fiscal_year_start_month` (1–12, default 1 = January, OHADA) — the owner setting
 *   that anchors the fiscal calendar.
 * - `fiscal_years` — one row per business per fiscal year (keyed by its start calendar year).
 * - `accounting_periods` — 12 monthly periods per fiscal year, generated eagerly, each with a
 *   lifecycle status (OPEN → CLOSING → CLOSED → LOCKED; transitions land in BIZ-5.3).
 *
 * Both tables carry `updated_at` so they ride the sync pull cursor, and are business-scoped +
 * uniquely keyed so the eager generation is idempotent (ON CONFLICT DO NOTHING).
 */
export class FiscalYearsAccountingPeriods1787000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "fiscal_year_start_month" integer NOT NULL DEFAULT 1`,
    )

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "fiscal_years" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "business_id" uuid NOT NULL,
        "year" integer NOT NULL,
        "label" character varying(20) NOT NULL,
        "start_month" integer NOT NULL,
        "start_date" date NOT NULL,
        "end_date" date NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "pk_fiscal_years" PRIMARY KEY ("id"),
        CONSTRAINT "unq_fiscal_years_business_year" UNIQUE ("business_id", "year")
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_fiscal_years_business_updated_at" ON "fiscal_years" ("business_id", "updated_at")`,
    )

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "accounting_periods" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "business_id" uuid NOT NULL,
        "fiscal_year_id" uuid NOT NULL,
        "period_number" integer NOT NULL,
        "label" character varying(10) NOT NULL,
        "start_date" date NOT NULL,
        "end_date" date NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'OPEN',
        "closed_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "pk_accounting_periods" PRIMARY KEY ("id"),
        CONSTRAINT "unq_accounting_periods_year_number" UNIQUE ("business_id", "fiscal_year_id", "period_number")
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_accounting_periods_business_updated_at" ON "accounting_periods" ("business_id", "updated_at")`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_accounting_periods_fiscal_year" ON "accounting_periods" ("fiscal_year_id")`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "accounting_periods"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "fiscal_years"`)
    await queryRunner.query(
      `ALTER TABLE "businesses" DROP COLUMN IF EXISTS "fiscal_year_start_month"`,
    )
  }
}
