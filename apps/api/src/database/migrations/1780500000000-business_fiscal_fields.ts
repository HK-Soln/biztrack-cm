import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Capture fiscal / OHADA identifiers on the business during setup: NIU, RCCM,
 * VAT registration + default rate, and fiscal regime. Stored only — no tax
 * computation consumes them yet (deferred OHADA accounting feature).
 */
export class BusinessFiscalFields1780500000000 implements MigrationInterface {
  name = 'BusinessFiscalFields1780500000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "businesses_fiscal_regime_enum" AS ENUM ('IMPOT_LIBERATOIRE', 'SIMPLIFIE', 'REEL');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `)
    await queryRunner.query(`
      ALTER TABLE "businesses"
        ADD COLUMN IF NOT EXISTS "niu" character varying,
        ADD COLUMN IF NOT EXISTS "rccm" character varying,
        ADD COLUMN IF NOT EXISTS "vat_registered" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "default_vat_rate" numeric(5,2),
        ADD COLUMN IF NOT EXISTS "fiscal_regime" "businesses_fiscal_regime_enum"
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "businesses"
        DROP COLUMN IF EXISTS "niu",
        DROP COLUMN IF EXISTS "rccm",
        DROP COLUMN IF EXISTS "vat_registered",
        DROP COLUMN IF EXISTS "default_vat_rate",
        DROP COLUMN IF EXISTS "fiscal_regime"
    `)
    await queryRunner.query(`DROP TYPE IF EXISTS "businesses_fiscal_regime_enum"`)
  }
}
