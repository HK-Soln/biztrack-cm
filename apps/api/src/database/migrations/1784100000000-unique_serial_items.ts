import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Unique-item mode: a serialized product can mark each unit as unique, so every serial unit
 * becomes a mini-product with its own image/description/SEO. All nullable/defaulted so
 * existing products and units are unaffected.
 */
export class UniqueSerialItems1784100000000 implements MigrationInterface {
  name = 'UniqueSerialItems1784100000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "unique_items" boolean NOT NULL DEFAULT false`,
    )
    await queryRunner.query(
      `ALTER TABLE "product_serial_units" ADD COLUMN IF NOT EXISTS "description" text`,
    )
    await queryRunner.query(
      `ALTER TABLE "product_serial_units" ADD COLUMN IF NOT EXISTS "image_url" character varying(1000)`,
    )
    await queryRunner.query(
      `ALTER TABLE "product_serial_units" ADD COLUMN IF NOT EXISTS "meta_title" character varying(200)`,
    )
    await queryRunner.query(
      `ALTER TABLE "product_serial_units" ADD COLUMN IF NOT EXISTS "meta_description" character varying(500)`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product_serial_units" DROP COLUMN IF EXISTS "meta_description"`,
    )
    await queryRunner.query(`ALTER TABLE "product_serial_units" DROP COLUMN IF EXISTS "meta_title"`)
    await queryRunner.query(`ALTER TABLE "product_serial_units" DROP COLUMN IF EXISTS "image_url"`)
    await queryRunner.query(
      `ALTER TABLE "product_serial_units" DROP COLUMN IF EXISTS "description"`,
    )
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "unique_items"`)
  }
}
