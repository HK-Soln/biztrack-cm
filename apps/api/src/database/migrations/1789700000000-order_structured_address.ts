import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Spec 10 ③ — structured delivery address on online orders: country (ISO2) + region, alongside the
 * existing free-text city + street address. Drives delivery-zone matching + the fee at checkout.
 */
export class OrderStructuredAddress1789700000000 implements MigrationInterface {
  name = 'OrderStructuredAddress1789700000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "online_orders" ADD COLUMN "delivery_country" character varying(2)`,
    )
    await queryRunner.query(
      `ALTER TABLE "online_orders" ADD COLUMN "delivery_region" character varying(120)`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "online_orders" DROP COLUMN IF EXISTS "delivery_region"`)
    await queryRunner.query(`ALTER TABLE "online_orders" DROP COLUMN IF EXISTS "delivery_country"`)
  }
}
