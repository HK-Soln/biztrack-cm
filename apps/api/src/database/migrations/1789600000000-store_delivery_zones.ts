import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Spec 10 ③ — address-driven delivery zones on online_stores. Zones (jsonb) each price addresses matching
 * a country/region/city subset (most-specific wins); a free-over-threshold, and a behaviour for addresses
 * matching no zone (block / default fee / arrange separately). Supersedes the flat delivery_fee +
 * free-text delivery_cities (kept for back-compat; the flat fee is the fallback when no zones exist).
 */
export class StoreDeliveryZones1789600000000 implements MigrationInterface {
  name = 'StoreDeliveryZones1789600000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "online_stores" ADD COLUMN "delivery_zones" jsonb NOT NULL DEFAULT '[]'`,
    )
    await queryRunner.query(
      `ALTER TABLE "online_stores" ADD COLUMN "free_delivery_over_amount" integer`,
    )
    await queryRunner.query(
      `ALTER TABLE "online_stores" ADD COLUMN "unlisted_area_behavior" character varying(20) NOT NULL DEFAULT 'DEFAULT_FEE'`,
    )
    await queryRunner.query(
      `ALTER TABLE "online_stores" ADD COLUMN "unlisted_default_fee" integer NOT NULL DEFAULT 0`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "online_stores" DROP COLUMN IF EXISTS "unlisted_default_fee"`)
    await queryRunner.query(
      `ALTER TABLE "online_stores" DROP COLUMN IF EXISTS "unlisted_area_behavior"`,
    )
    await queryRunner.query(
      `ALTER TABLE "online_stores" DROP COLUMN IF EXISTS "free_delivery_over_amount"`,
    )
    await queryRunner.query(`ALTER TABLE "online_stores" DROP COLUMN IF EXISTS "delivery_zones"`)
  }
}
