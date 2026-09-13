import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Receipt configuration on the business (business-level, so every device gets it): `receipt_settings`
 * (jsonb — paper width, thanks message, content toggles) and `receipt_number_prefix` (default applied
 * at generation time, so it only affects subsequent receipts). Device print mechanics (printer, copies,
 * auto-print) are device-local and NOT stored here.
 */
export class BusinessReceiptSettings1790200000000 implements MigrationInterface {
  name = 'BusinessReceiptSettings1790200000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "receipt_settings" jsonb`,
    )
    await queryRunner.query(
      `ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "receipt_number_prefix" character varying(16)`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "businesses" DROP COLUMN IF EXISTS "receipt_number_prefix"`)
    await queryRunner.query(`ALTER TABLE "businesses" DROP COLUMN IF EXISTS "receipt_settings"`)
  }
}
