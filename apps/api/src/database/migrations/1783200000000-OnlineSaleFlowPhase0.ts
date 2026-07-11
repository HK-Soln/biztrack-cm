import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Online-order → sale flow, Phase 0 (schema + links, ships dark). See
 * docs/online-order-sale-flow-implementation-plan.md.
 *
 * - sales: `source` channel + bidirectional `online_order_id` link.
 * - sale_payments: signed-ledger `kind` + append metadata (COD collection / refund).
 * - online_orders: persisted fee breakdown so confirm-time sales keep fees as charge lines.
 * - sale_returns / sale_return_items: return/refund records (children of the sale aggregate).
 * - Backfill: link existing online-created sales (client_id = online_order.id) + tag source.
 */
export class OnlineSaleFlowPhase01783200000000 implements MigrationInterface {
  name = 'OnlineSaleFlowPhase01783200000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- sales: channel + order link ---------------------------------------
    await queryRunner.query(
      `ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "source" character varying NOT NULL DEFAULT 'IN_STORE'`,
    )
    await queryRunner.query(`ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "online_order_id" uuid`)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_sales_online_order_id" ON "sales" ("online_order_id")`,
    )

    // --- sale_payments: signed ledger + append metadata --------------------
    await queryRunner.query(
      `ALTER TABLE "sale_payments" ADD COLUMN IF NOT EXISTS "kind" character varying NOT NULL DEFAULT 'PAYMENT'`,
    )
    await queryRunner.query(
      `ALTER TABLE "sale_payments" ADD COLUMN IF NOT EXISTS "recorded_at" TIMESTAMP WITH TIME ZONE`,
    )
    await queryRunner.query(
      `ALTER TABLE "sale_payments" ADD COLUMN IF NOT EXISTS "recorded_by_id" uuid`,
    )
    await queryRunner.query(`ALTER TABLE "sale_payments" ADD COLUMN IF NOT EXISTS "note" text`)

    // --- online_orders: fee breakdown --------------------------------------
    await queryRunner.query(
      `ALTER TABLE "online_orders" ADD COLUMN IF NOT EXISTS "subtotal" integer NOT NULL DEFAULT 0`,
    )
    await queryRunner.query(
      `ALTER TABLE "online_orders" ADD COLUMN IF NOT EXISTS "delivery_fee" integer NOT NULL DEFAULT 0`,
    )
    await queryRunner.query(
      `ALTER TABLE "online_orders" ADD COLUMN IF NOT EXISTS "cod_fee" integer NOT NULL DEFAULT 0`,
    )
    await queryRunner.query(
      `ALTER TABLE "online_orders" ADD COLUMN IF NOT EXISTS "other_charges" integer NOT NULL DEFAULT 0`,
    )

    // --- sale_returns / sale_return_items ----------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sale_returns" (
        "id" uuid NOT NULL,
        "sale_id" uuid NOT NULL,
        "business_id" uuid NOT NULL,
        "online_order_id" uuid,
        "reason" text,
        "restock" boolean NOT NULL DEFAULT true,
        "refund_amount" numeric(12,2) NOT NULL DEFAULT 0,
        "created_by_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_sale_returns" PRIMARY KEY ("id"),
        CONSTRAINT "fk_sale_returns_sale_id" FOREIGN KEY ("sale_id")
          REFERENCES "sales"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_sale_returns_business_id" FOREIGN KEY ("business_id")
          REFERENCES "businesses"("id") ON DELETE CASCADE
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_sale_returns_sale_id" ON "sale_returns" ("sale_id")`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_sale_returns_business_id" ON "sale_returns" ("business_id")`,
    )

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sale_return_items" (
        "id" uuid NOT NULL,
        "sale_return_id" uuid NOT NULL,
        "business_id" uuid NOT NULL,
        "sale_item_id" uuid NOT NULL,
        "quantity" numeric(12,2) NOT NULL DEFAULT 0,
        "serial_unit_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_sale_return_items" PRIMARY KEY ("id"),
        CONSTRAINT "fk_sale_return_items_return_id" FOREIGN KEY ("sale_return_id")
          REFERENCES "sale_returns"("id") ON DELETE CASCADE
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_sale_return_items_return_id" ON "sale_return_items" ("sale_return_id")`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_sale_return_items_business_id" ON "sale_return_items" ("business_id")`,
    )

    // --- backfill ----------------------------------------------------------
    // Link historical online-created sales to their order + tag the channel. The online
    // order's sale is idempotency-keyed by client_id = online_order.id (see createSaleForOrder).
    await queryRunner.query(`
      UPDATE "sales" s
      SET "online_order_id" = o."id", "source" = 'ONLINE'
      FROM "online_orders" o
      WHERE o."id"::text = s."client_id"::text AND s."online_order_id" IS NULL
    `)
    // Seed subtotal from total for historical orders (no stored fee breakdown; fees were 0).
    await queryRunner.query(
      `UPDATE "online_orders" SET "subtotal" = "total_amount" WHERE "subtotal" = 0`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "sale_return_items"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "sale_returns"`)
    await queryRunner.query(`ALTER TABLE "online_orders" DROP COLUMN IF EXISTS "other_charges"`)
    await queryRunner.query(`ALTER TABLE "online_orders" DROP COLUMN IF EXISTS "cod_fee"`)
    await queryRunner.query(`ALTER TABLE "online_orders" DROP COLUMN IF EXISTS "delivery_fee"`)
    await queryRunner.query(`ALTER TABLE "online_orders" DROP COLUMN IF EXISTS "subtotal"`)
    await queryRunner.query(`ALTER TABLE "sale_payments" DROP COLUMN IF EXISTS "note"`)
    await queryRunner.query(`ALTER TABLE "sale_payments" DROP COLUMN IF EXISTS "recorded_by_id"`)
    await queryRunner.query(`ALTER TABLE "sale_payments" DROP COLUMN IF EXISTS "recorded_at"`)
    await queryRunner.query(`ALTER TABLE "sale_payments" DROP COLUMN IF EXISTS "kind"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_sales_online_order_id"`)
    await queryRunner.query(`ALTER TABLE "sales" DROP COLUMN IF EXISTS "online_order_id"`)
    await queryRunner.query(`ALTER TABLE "sales" DROP COLUMN IF EXISTS "source"`)
  }
}
