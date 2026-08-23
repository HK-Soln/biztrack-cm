import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Per-role discount limits (BIZ-1.4). A discount beyond a member's role limit still
 * completes (APPROVE, never BLOCK) but is flagged unauthorized until a manager PIN
 * clears it. Limits live on the role so they ride the existing roles sync to offline
 * tills. NULL = no limit (opt-in). Seeded system OWNER/MANAGER get no limits +
 * allow_below_cost; CASHIER/ACCOUNTANT start unlimited-but-flagged-nothing until an
 * owner configures them.
 */
export class RoleDiscountLimits1784800000000 implements MigrationInterface {
  name = 'RoleDiscountLimits1784800000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "max_discount_percent" numeric(5,2)`,
    )
    await queryRunner.query(
      `ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "max_cart_discount_percent" numeric(5,2)`,
    )
    await queryRunner.query(
      `ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "max_discount_amount_xaf" numeric(12,2)`,
    )
    await queryRunner.query(
      `ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "allow_below_cost" boolean NOT NULL DEFAULT false`,
    )
    // Existing system OWNER/MANAGER may sell below cost without a flag.
    await queryRunner.query(
      `UPDATE "roles" SET "allow_below_cost" = true WHERE "is_system" = true AND "name" IN ('OWNER', 'MANAGER')`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const col of [
      'allow_below_cost',
      'max_discount_amount_xaf',
      'max_cart_discount_percent',
      'max_discount_percent',
    ]) {
      await queryRunner.query(`ALTER TABLE "roles" DROP COLUMN IF EXISTS "${col}"`)
    }
  }
}
