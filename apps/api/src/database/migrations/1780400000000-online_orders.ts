import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Phase 3I (part 2) — online carts, orders, and the order-event timeline.
 *
 * sale_id is nullable: a checkout creates a PENDING order; the financial sale is
 * created when the merchant confirms (part 3). The order carries its own items
 * snapshot + total so it stands alone until then.
 */
export class OnlineOrders1780400000000 implements MigrationInterface {
  name = 'OnlineOrders1780400000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "online_carts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "online_store_id" uuid NOT NULL,
        "session_token" character varying(200) NOT NULL,
        "items" jsonb NOT NULL DEFAULT '[]',
        "customer_email" character varying(300),
        "customer_name" character varying(200),
        "customer_phone" character varying(30),
        "notes" text,
        "expires_at" TIMESTAMP NOT NULL DEFAULT (now() + INTERVAL '7 days'),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_online_carts_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_online_carts_session" UNIQUE ("session_token")
      )
    `)
    await queryRunner.query(`
      ALTER TABLE "online_carts"
      ADD CONSTRAINT "fk_online_carts_store"
      FOREIGN KEY ("online_store_id") REFERENCES "online_stores"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_online_carts_store" ON "online_carts" ("online_store_id")
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "online_orders" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "online_store_id" uuid NOT NULL,
        "business_id" uuid NOT NULL,
        "sale_id" uuid,
        "order_number" character varying(30) NOT NULL,
        "tracking_token" character varying(64) NOT NULL,
        "items" jsonb NOT NULL DEFAULT '[]',
        "total_amount" integer NOT NULL DEFAULT 0,
        "customer_name" character varying(200) NOT NULL,
        "customer_email" character varying(300),
        "customer_phone" character varying(30),
        "fulfillment_type" character varying(20) NOT NULL DEFAULT 'DELIVERY',
        "delivery_address" text,
        "delivery_city" character varying(100),
        "delivery_notes" text,
        "status" character varying(20) NOT NULL DEFAULT 'PENDING',
        "payment_method" character varying(40),
        "payment_status" character varying(20) NOT NULL DEFAULT 'PENDING',
        "payment_reference" character varying(200),
        "confirmed_at" TIMESTAMP,
        "dispatched_at" TIMESTAMP,
        "delivered_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_online_orders_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_online_orders_number" UNIQUE ("order_number"),
        CONSTRAINT "uq_online_orders_sale" UNIQUE ("sale_id"),
        CONSTRAINT "chk_online_orders_status"
          CHECK ("status" IN ('PENDING','CONFIRMED','PREPARING','DISPATCHED','DELIVERED','CANCELLED','REFUNDED')),
        CONSTRAINT "chk_online_orders_fulfillment"
          CHECK ("fulfillment_type" IN ('DELIVERY','PICKUP'))
      )
    `)
    await queryRunner.query(`
      ALTER TABLE "online_orders"
      ADD CONSTRAINT "fk_online_orders_store"
      FOREIGN KEY ("online_store_id") REFERENCES "online_stores"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
    `)
    await queryRunner.query(`
      ALTER TABLE "online_orders"
      ADD CONSTRAINT "fk_online_orders_sale"
      FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_online_orders_store" ON "online_orders" ("online_store_id")
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_online_orders_business" ON "online_orders" ("business_id", "created_at")
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_online_orders_status" ON "online_orders" ("status")
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_online_orders_tracking" ON "online_orders" ("tracking_token")
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "online_order_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "online_order_id" uuid NOT NULL,
        "business_id" uuid NOT NULL,
        "event_type" character varying(40) NOT NULL,
        "from_status" character varying(20),
        "to_status" character varying(20),
        "triggered_by" character varying(20) NOT NULL,
        "actor_id" uuid,
        "actor_name" text,
        "is_customer_visible" boolean NOT NULL DEFAULT true,
        "customer_message" text,
        "internal_note" text,
        "tracking_token" character varying(64),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_online_order_events_id" PRIMARY KEY ("id")
      )
    `)
    await queryRunner.query(`
      ALTER TABLE "online_order_events"
      ADD CONSTRAINT "fk_online_order_events_order"
      FOREIGN KEY ("online_order_id") REFERENCES "online_orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_order_events_order"
      ON "online_order_events" ("online_order_id", "created_at")
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_order_events_business"
      ON "online_order_events" ("business_id", "created_at")
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "online_order_events"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "online_orders"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "online_carts"`)
  }
}
