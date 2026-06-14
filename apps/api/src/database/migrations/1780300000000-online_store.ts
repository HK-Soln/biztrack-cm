import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Phase 3I (part 1) — BizTrack Online: store configuration + product publishing.
 * Carts, orders, and order events follow in a later migration.
 */
export class OnlineStore1780300000000 implements MigrationInterface {
  name = 'OnlineStore1780300000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "is_published_online" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "online_description" text,
      ADD COLUMN IF NOT EXISTS "meta_title" character varying(200),
      ADD COLUMN IF NOT EXISTS "meta_description" character varying(500),
      ADD COLUMN IF NOT EXISTS "online_sort_order" integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "online_stock_reserve" integer NOT NULL DEFAULT 0
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "online_stores" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "business_id" uuid NOT NULL,
        "store_name" character varying(200) NOT NULL,
        "store_slug" character varying(100) NOT NULL,
        "tagline" character varying(500),
        "logo_url" text,
        "banner_url" text,
        "primary_color" character varying(7) NOT NULL DEFAULT '#1D9E75',
        "phone" character varying(30),
        "email" character varying(300),
        "address" text,
        "city" character varying(100),
        "whatsapp_number" character varying(30),
        "domain_type" character varying(20) NOT NULL DEFAULT 'SUBDOMAIN',
        "custom_domain" character varying(300),
        "domain_verified" boolean NOT NULL DEFAULT false,
        "ssl_issued" boolean NOT NULL DEFAULT false,
        "is_active" boolean NOT NULL DEFAULT true,
        "show_out_of_stock" boolean NOT NULL DEFAULT false,
        "allow_order_notes" boolean NOT NULL DEFAULT true,
        "min_order_amount" integer,
        "currency" character(3) NOT NULL DEFAULT 'XAF',
        "payment_cash_on_delivery" boolean NOT NULL DEFAULT true,
        "payment_mtn_momo" boolean NOT NULL DEFAULT false,
        "payment_orange_money" boolean NOT NULL DEFAULT false,
        "payment_card" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_online_stores_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_online_stores_business" UNIQUE ("business_id"),
        CONSTRAINT "uq_online_stores_slug" UNIQUE ("store_slug"),
        CONSTRAINT "chk_online_stores_domain_type"
          CHECK ("domain_type" IN ('PATH', 'SUBDOMAIN', 'CUSTOM', 'PURCHASED'))
      )
    `)
    await queryRunner.query(`
      ALTER TABLE "online_stores"
      ADD CONSTRAINT "fk_online_stores_business_id"
      FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_online_stores_slug" ON "online_stores" ("store_slug")
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_online_stores_domain"
      ON "online_stores" ("custom_domain") WHERE "custom_domain" IS NOT NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "online_stores"`)
    await queryRunner.query(`
      ALTER TABLE "products"
      DROP COLUMN IF EXISTS "online_stock_reserve",
      DROP COLUMN IF EXISTS "online_sort_order",
      DROP COLUMN IF EXISTS "meta_description",
      DROP COLUMN IF EXISTS "meta_title",
      DROP COLUMN IF EXISTS "online_description",
      DROP COLUMN IF EXISTS "is_published_online"
    `)
  }
}
