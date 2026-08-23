import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * BIZ-1.2: enrich sale_discounts with reason + authorization metadata (⛔ no new
 * table — sale_item_id already scopes line-vs-cart). The discount_type column is a
 * free-form varchar, so its widened value set (OVERRIDE/ROUNDING/DAMAGE/
 * STAFF_PURCHASE) needs no schema change.
 *
 *  - reason_code / reason_note  — why the discount was given (reason_note required
 *    by the UI when reason_code = OTHER).
 *  - applied_by                 — the cashier who applied it.
 *  - authorized_by              — the manager, when a step-up occurred (BIZ-1.4/1.6).
 *  - unauthorized               — proceeded over a role limit without approval.
 *  - below_cost                 — the discounted price is below cost.
 */
export class SaleDiscountReasonAuthz1784600000000 implements MigrationInterface {
  name = 'SaleDiscountReasonAuthz1784600000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sale_discounts" ADD COLUMN IF NOT EXISTS "reason_code" varchar(30)`,
    )
    await queryRunner.query(
      `ALTER TABLE "sale_discounts" ADD COLUMN IF NOT EXISTS "reason_note" text`,
    )
    await queryRunner.query(
      `ALTER TABLE "sale_discounts" ADD COLUMN IF NOT EXISTS "applied_by" uuid`,
    )
    await queryRunner.query(
      `ALTER TABLE "sale_discounts" ADD COLUMN IF NOT EXISTS "authorized_by" uuid`,
    )
    await queryRunner.query(
      `ALTER TABLE "sale_discounts" ADD COLUMN IF NOT EXISTS "unauthorized" boolean NOT NULL DEFAULT false`,
    )
    await queryRunner.query(
      `ALTER TABLE "sale_discounts" ADD COLUMN IF NOT EXISTS "below_cost" boolean NOT NULL DEFAULT false`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const col of [
      'below_cost',
      'unauthorized',
      'authorized_by',
      'applied_by',
      'reason_note',
      'reason_code',
    ]) {
      await queryRunner.query(`ALTER TABLE "sale_discounts" DROP COLUMN IF EXISTS "${col}"`)
    }
  }
}
