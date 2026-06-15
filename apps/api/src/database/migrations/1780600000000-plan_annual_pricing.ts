import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Annual billing: an annual price per plan (defaults to 10× monthly — two months
 * free) and the chosen billing cycle on the business. Onboarding still starts a
 * trial; the cycle is recorded for when billing is wired up.
 */
export class PlanAnnualPricing1780600000000 implements MigrationInterface {
  name = 'PlanAnnualPricing1780600000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "plan_configs"
      ADD COLUMN IF NOT EXISTS "price_annual_xaf" integer NOT NULL DEFAULT 0
    `)
    // Backfill: two months free on annual (10× monthly) for paid plans.
    await queryRunner.query(`UPDATE "plan_configs" SET "price_annual_xaf" = "price_xaf" * 10`)

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "businesses_billing_cycle_enum" AS ENUM ('MONTHLY', 'ANNUAL');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `)
    await queryRunner.query(`
      ALTER TABLE "businesses"
      ADD COLUMN IF NOT EXISTS "billing_cycle" "businesses_billing_cycle_enum" NOT NULL DEFAULT 'MONTHLY'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "businesses" DROP COLUMN IF EXISTS "billing_cycle"`)
    await queryRunner.query(`DROP TYPE IF EXISTS "businesses_billing_cycle_enum"`)
    await queryRunner.query(`ALTER TABLE "plan_configs" DROP COLUMN IF EXISTS "price_annual_xaf"`)
  }
}
