import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Default credit period per business (P3 / D9). When an on-account debt carries no
 * explicit due_date, its effective due date is created_at + default_credit_days — the
 * basis for ageing buckets and debt-due reminders.
 */
export class BusinessDefaultCreditDays1786700000000 implements MigrationInterface {
  name = 'BusinessDefaultCreditDays1786700000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "default_credit_days" integer NOT NULL DEFAULT 30`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "businesses" DROP COLUMN IF EXISTS "default_credit_days"`)
  }
}
