import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Deposit sessions: a customer can have many closed deposit sessions but at most one OPEN.
 * Adds the lifecycle columns and swaps the per-customer unique for a partial unique on OPEN.
 */
export class DepositSessions1782100000000 implements MigrationInterface {
  name = 'DepositSessions1782100000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "savings_accounts" ADD COLUMN IF NOT EXISTS "total_transferred" numeric(12,2) NOT NULL DEFAULT 0`)
    await queryRunner.query(`ALTER TABLE "savings_accounts" ADD COLUMN IF NOT EXISTS "status" character varying(10) NOT NULL DEFAULT 'OPEN'`)
    await queryRunner.query(`ALTER TABLE "savings_accounts" ADD COLUMN IF NOT EXISTS "outcome" character varying(30)`)
    await queryRunner.query(`ALTER TABLE "savings_accounts" ADD COLUMN IF NOT EXISTS "closed_at" timestamptz`)
    await queryRunner.query(`ALTER TABLE "savings_accounts" ADD COLUMN IF NOT EXISTS "closed_by_id" uuid`)
    await queryRunner.query(`ALTER TABLE "savings_accounts" ADD COLUMN IF NOT EXISTS "transferred_to_id" uuid`)
    // One OPEN session per customer (closed sessions accumulate as history).
    await queryRunner.query(`ALTER TABLE "savings_accounts" DROP CONSTRAINT IF EXISTS "unq_savings_business_customer"`)
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_savings_open_per_customer" ON "savings_accounts" ("business_id", "customer_id") WHERE status = 'OPEN' AND is_deleted = false`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_savings_open_per_customer"`)
    await queryRunner.query(`ALTER TABLE "savings_accounts" DROP COLUMN IF EXISTS "transferred_to_id"`)
    await queryRunner.query(`ALTER TABLE "savings_accounts" DROP COLUMN IF EXISTS "closed_by_id"`)
    await queryRunner.query(`ALTER TABLE "savings_accounts" DROP COLUMN IF EXISTS "closed_at"`)
    await queryRunner.query(`ALTER TABLE "savings_accounts" DROP COLUMN IF EXISTS "outcome"`)
    await queryRunner.query(`ALTER TABLE "savings_accounts" DROP COLUMN IF EXISTS "status"`)
    await queryRunner.query(`ALTER TABLE "savings_accounts" DROP COLUMN IF EXISTS "total_transferred"`)
  }
}
