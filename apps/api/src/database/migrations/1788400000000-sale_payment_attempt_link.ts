import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Spec 07 build-order 5b [A11] — trace a sale_payments ledger row back to the provider attempt that
 * produced it. Additive nullable column (append-only forbids UPDATE/DELETE, not ADD COLUMN); no
 * backfill. Needed because mobile_money_reference is NULL for MANUAL hard-confirms — the case most
 * worth auditing. Desktop parity: electron-core 0080 + SALE_PAYMENT_MAP.
 */
export class SalePaymentAttemptLink1788400000000 implements MigrationInterface {
  name = 'SalePaymentAttemptLink1788400000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sale_payments" ADD COLUMN IF NOT EXISTS "payment_attempt_id" uuid`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_sale_payments_payment_attempt" ON "sale_payments" ("payment_attempt_id")`,
    )
    await queryRunner.query(`
      ALTER TABLE "sale_payments"
        ADD CONSTRAINT "fk_sale_payments_payment_attempt"
        FOREIGN KEY ("payment_attempt_id") REFERENCES "payment_attempts"("id")
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sale_payments" DROP CONSTRAINT IF EXISTS "fk_sale_payments_payment_attempt"`,
    )
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_sale_payments_payment_attempt"`)
    await queryRunner.query(
      `ALTER TABLE "sale_payments" DROP COLUMN IF EXISTS "payment_attempt_id"`,
    )
  }
}
