import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Variants are mini-products: give them their own description + SEO/online fields.
 * All nullable/defaulted so existing variants are unaffected.
 */
export class VariantSeo1784000000000 implements MigrationInterface {
  name = 'VariantSeo1784000000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "description" text`,
    )
    await queryRunner.query(
      `ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "meta_title" character varying(200)`,
    )
    await queryRunner.query(
      `ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "meta_description" character varying(500)`,
    )
    await queryRunner.query(
      `ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "online_description" text`,
    )
    await queryRunner.query(
      `ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "is_published_online" boolean NOT NULL DEFAULT false`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product_variants" DROP COLUMN IF EXISTS "is_published_online"`,
    )
    await queryRunner.query(
      `ALTER TABLE "product_variants" DROP COLUMN IF EXISTS "online_description"`,
    )
    await queryRunner.query(
      `ALTER TABLE "product_variants" DROP COLUMN IF EXISTS "meta_description"`,
    )
    await queryRunner.query(`ALTER TABLE "product_variants" DROP COLUMN IF EXISTS "meta_title"`)
    await queryRunner.query(`ALTER TABLE "product_variants" DROP COLUMN IF EXISTS "description"`)
  }
}
