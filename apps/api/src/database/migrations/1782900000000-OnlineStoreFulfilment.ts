import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Store-level fulfilment config: whether the store offers delivery and/or pickup, a flat
 * delivery fee, a pickup address, and the list of cities/zones it delivers to. Backs the
 * store-config admin (T3) and pairs with the branched DELIVERY/PICKUP online orders.
 */
export class OnlineStoreFulfilment1782900000000 implements MigrationInterface {
  name = 'OnlineStoreFulfilment1782900000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "online_stores" ADD "offer_delivery" boolean NOT NULL DEFAULT true`,
    )
    await queryRunner.query(
      `ALTER TABLE "online_stores" ADD "offer_pickup" boolean NOT NULL DEFAULT true`,
    )
    await queryRunner.query(
      `ALTER TABLE "online_stores" ADD "delivery_fee" integer NOT NULL DEFAULT 0`,
    )
    await queryRunner.query(`ALTER TABLE "online_stores" ADD "pickup_address" text`)
    await queryRunner.query(
      `ALTER TABLE "online_stores" ADD "delivery_cities" jsonb NOT NULL DEFAULT '[]'`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "online_stores" DROP COLUMN "delivery_cities"`)
    await queryRunner.query(`ALTER TABLE "online_stores" DROP COLUMN "pickup_address"`)
    await queryRunner.query(`ALTER TABLE "online_stores" DROP COLUMN "delivery_fee"`)
    await queryRunner.query(`ALTER TABLE "online_stores" DROP COLUMN "offer_pickup"`)
    await queryRunner.query(`ALTER TABLE "online_stores" DROP COLUMN "offer_delivery"`)
  }
}
