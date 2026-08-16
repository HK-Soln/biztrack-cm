import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Cash-variance reason (BIZ-2.6). When a shift closes with |variance| beyond the
 * tolerance band, the cashier picks a blame-free reason (change error / unrecorded sale /
 * unrecorded expense / don't know) + an optional note. Stored on the session; rides the
 * cash_session sync.
 */
export class CashSessionVarianceReason1785200000000 implements MigrationInterface {
  name = 'CashSessionVarianceReason1785200000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "cash_sessions" ADD COLUMN IF NOT EXISTS "variance_reason" character varying(30)`,
    )
    await queryRunner.query(
      `ALTER TABLE "cash_sessions" ADD COLUMN IF NOT EXISTS "variance_note" text`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "cash_sessions" DROP COLUMN IF EXISTS "variance_note"`)
    await queryRunner.query(`ALTER TABLE "cash_sessions" DROP COLUMN IF EXISTS "variance_reason"`)
  }
}
