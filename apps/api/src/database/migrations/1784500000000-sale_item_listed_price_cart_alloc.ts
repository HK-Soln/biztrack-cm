import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * BIZ-1.1: catalogue (listed) unit price + cart-discount allocation on sale lines.
 *
 *  - `unit_price_listed`  — catalogue price at sale time (snapshot; history never
 *    moves when the catalogue changes). Backfilled to the charged `unit_price`.
 *  - `cart_discount_alloc` — this line's share of the sale-level discount (0 until
 *    BIZ-1.3). Line total = unit_price*qty − discount_amount − cart_discount_alloc.
 *
 * Both are money, so each gets the whole-XAF CHECK from BIZ-0.2.
 */
export class SaleItemListedPriceCartAlloc1784500000000 implements MigrationInterface {
  name = 'SaleItemListedPriceCartAlloc1784500000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sale_items" ADD COLUMN IF NOT EXISTS "unit_price_listed" decimal(12,2)`,
    )
    await queryRunner.query(
      `ALTER TABLE "sale_items" ADD COLUMN IF NOT EXISTS "cart_discount_alloc" decimal(12,2) NOT NULL DEFAULT 0`,
    )
    // Existing rows predate listed-price tracking: the charged price is the best proxy.
    await queryRunner.query(
      `UPDATE "sale_items" SET "unit_price_listed" = "unit_price" WHERE "unit_price_listed" IS NULL`,
    )
    await queryRunner.query(
      `ALTER TABLE "sale_items" ADD CONSTRAINT "chk_sale_items_unit_price_listed_whole_xaf" ` +
        `CHECK ("unit_price_listed" IS NULL OR "unit_price_listed" = round("unit_price_listed"))`,
    )
    await queryRunner.query(
      `ALTER TABLE "sale_items" ADD CONSTRAINT "chk_sale_items_cart_discount_alloc_whole_xaf" ` +
        `CHECK ("cart_discount_alloc" IS NULL OR "cart_discount_alloc" = round("cart_discount_alloc"))`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sale_items" DROP CONSTRAINT IF EXISTS "chk_sale_items_cart_discount_alloc_whole_xaf"`,
    )
    await queryRunner.query(
      `ALTER TABLE "sale_items" DROP CONSTRAINT IF EXISTS "chk_sale_items_unit_price_listed_whole_xaf"`,
    )
    await queryRunner.query(`ALTER TABLE "sale_items" DROP COLUMN IF EXISTS "cart_discount_alloc"`)
    await queryRunner.query(`ALTER TABLE "sale_items" DROP COLUMN IF EXISTS "unit_price_listed"`)
  }
}
