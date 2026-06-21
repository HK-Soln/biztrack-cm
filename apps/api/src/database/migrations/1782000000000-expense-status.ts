import { MigrationInterface, QueryRunner } from 'typeorm'

/** Payment status of an expense (PAID | PENDING). Defaults to PAID for existing rows. */
export class ExpenseStatus1782000000000 implements MigrationInterface {
  name = 'ExpenseStatus1782000000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "status" character varying NOT NULL DEFAULT 'PAID'`)
    // Pending expenses carry no payment method until they're settled.
    await queryRunner.query(`ALTER TABLE "expenses" ALTER COLUMN "payment_method" DROP NOT NULL`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "expenses" ALTER COLUMN "payment_method" SET NOT NULL`)
    await queryRunner.query(`ALTER TABLE "expenses" DROP COLUMN IF EXISTS "status"`)
  }
}
