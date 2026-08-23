import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * BIZ-5.3 — the idempotent period-close pipeline.
 *
 * - `accounting_periods.close_snapshot` (jsonb) — the figures frozen when the period was closed,
 *   so later drift can be detected; `close_version` bumps on any future reopen so a re-close
 *   re-runs its steps under a fresh idempotency scope.
 * - `period_close_runs` — one row per (period, step, close_version), recording that a close step
 *   ran. The UNIQUE key makes the pipeline idempotent: a retried close skips already-run steps.
 *   Server-only (not synced): internal bookkeeping.
 */
export class PeriodClosePipeline1787100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "accounting_periods"
        ADD COLUMN IF NOT EXISTS "close_snapshot" jsonb,
        ADD COLUMN IF NOT EXISTS "close_version" integer NOT NULL DEFAULT 0
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "period_close_runs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "business_id" uuid NOT NULL,
        "period_id" uuid NOT NULL,
        "close_version" integer NOT NULL DEFAULT 0,
        "step_key" character varying(80) NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'COMPLETED',
        "result" jsonb,
        "ran_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_period_close_runs" PRIMARY KEY ("id"),
        CONSTRAINT "unq_period_close_runs_step_period_version"
          UNIQUE ("period_id", "step_key", "close_version")
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_period_close_runs_period" ON "period_close_runs" ("period_id")`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "period_close_runs"`)
    await queryRunner.query(`
      ALTER TABLE "accounting_periods"
        DROP COLUMN IF EXISTS "close_snapshot",
        DROP COLUMN IF EXISTS "close_version"
    `)
  }
}
