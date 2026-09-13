import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Spec 09 — SALE_DRAFT payment intents. A payment link can carry a full POS sale DTO (`draft_payload`)
 * with no sale created yet; when the expected amount is collected, the backend materializes the real
 * sale with its true tender and records the id here (`sale_id`). Both nullable — only SALE_DRAFT links
 * use them.
 */
export class PaymentLinkSaleDraft1789100000000 implements MigrationInterface {
  name = 'PaymentLinkSaleDraft1789100000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payment_links" ADD COLUMN "draft_payload" jsonb`)
    await queryRunner.query(`ALTER TABLE "payment_links" ADD COLUMN "sale_id" uuid`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payment_links" DROP COLUMN IF EXISTS "sale_id"`)
    await queryRunner.query(`ALTER TABLE "payment_links" DROP COLUMN IF EXISTS "draft_payload"`)
  }
}
