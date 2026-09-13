import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Spec 10 ② — online-order prepayments + COD eligibility config on online_stores. Lets a store accept a
 * deposit online with the balance on delivery, require that deposit (hiding full COD so it can't be
 * bypassed), and gate cash-on-delivery by order amount.
 */
export class StorePrepaymentCod1789400000000 implements MigrationInterface {
  name = 'StorePrepaymentCod1789400000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "online_stores" ADD COLUMN "allow_partial_payment" boolean NOT NULL DEFAULT false`,
    )
    await queryRunner.query(
      `ALTER TABLE "online_stores" ADD COLUMN "partial_min_percent" integer NOT NULL DEFAULT 50`,
    )
    await queryRunner.query(
      `ALTER TABLE "online_stores" ADD COLUMN "partial_min_order_amount" integer NOT NULL DEFAULT 0`,
    )
    await queryRunner.query(
      `ALTER TABLE "online_stores" ADD COLUMN "deposit_required" boolean NOT NULL DEFAULT false`,
    )
    await queryRunner.query(
      `ALTER TABLE "online_stores" ADD COLUMN "cod_min_order_amount" integer NOT NULL DEFAULT 0`,
    )
    await queryRunner.query(
      `ALTER TABLE "online_stores" ADD COLUMN "cod_max_order_amount" integer`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "online_stores" DROP COLUMN IF EXISTS "cod_max_order_amount"`)
    await queryRunner.query(`ALTER TABLE "online_stores" DROP COLUMN IF EXISTS "cod_min_order_amount"`)
    await queryRunner.query(`ALTER TABLE "online_stores" DROP COLUMN IF EXISTS "deposit_required"`)
    await queryRunner.query(
      `ALTER TABLE "online_stores" DROP COLUMN IF EXISTS "partial_min_order_amount"`,
    )
    await queryRunner.query(`ALTER TABLE "online_stores" DROP COLUMN IF EXISTS "partial_min_percent"`)
    await queryRunner.query(
      `ALTER TABLE "online_stores" DROP COLUMN IF EXISTS "allow_partial_payment"`,
    )
  }
}
