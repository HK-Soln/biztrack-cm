import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Purchase Orders — the formal order placed with a supplier (optionally from a chosen
 * RFQ quote). Items carry agreed unit prices + a running received quantity so a restock
 * can fill against the PO.
 */
export class PurchaseOrders1781400000000 implements MigrationInterface {
  name = 'PurchaseOrders1781400000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "purchase_orders" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "business_id" uuid NOT NULL,
        "number" character varying NOT NULL,
        "rfq_id" uuid,
        "supplier_id" uuid NOT NULL,
        "supplier_name" character varying,
        "title" character varying,
        "message_body" text,
        "status" character varying NOT NULL DEFAULT 'DRAFT',
        "currency" character varying NOT NULL DEFAULT 'XAF',
        "expected_date" TIMESTAMP WITH TIME ZONE,
        "total_amount" numeric(14,2) NOT NULL DEFAULT 0,
        "sent_at" TIMESTAMP WITH TIME ZONE,
        "created_by_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_purchase_orders_id" PRIMARY KEY ("id")
      )
    `)
    await queryRunner.query(`
      ALTER TABLE "purchase_orders" ADD CONSTRAINT "fk_purchase_orders_business_id"
      FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_purchase_orders_business_id_deleted_at" ON "purchase_orders" ("business_id", "deleted_at")`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_purchase_orders_business_id_status" ON "purchase_orders" ("business_id", "status")`)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "purchase_order_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "purchase_order_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "variant_id" uuid,
        "description" character varying NOT NULL,
        "quantity" numeric(14,2) NOT NULL,
        "unit_price" numeric(14,2) NOT NULL DEFAULT 0,
        "received_quantity" numeric(14,2) NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_purchase_order_items_id" PRIMARY KEY ("id")
      )
    `)
    await queryRunner.query(`
      ALTER TABLE "purchase_order_items" ADD CONSTRAINT "fk_po_items_purchase_order_id"
      FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_po_items_purchase_order_id" ON "purchase_order_items" ("purchase_order_id")`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "purchase_order_items"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "purchase_orders"`)
  }
}
