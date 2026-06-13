import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Phase 3G — serialised inventory / IMEI tracking.
 *
 * - products gains is_serialized / serial_type / warranty_months. Serialisation
 *   is only valid for SIMPLE products (enforced at the application layer).
 * - sale_items gains serial_unit_id / serial_number (snapshot for receipts).
 * - product_serial_units: one row per physical unit. Stock for a serialised
 *   product is the count of IN_STOCK units.
 */
export class SerializedInventory1780100000000 implements MigrationInterface {
  name = 'SerializedInventory1780100000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "is_serialized" boolean NOT NULL DEFAULT false
    `)
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "serial_type" character varying(20)
    `)
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "warranty_months" integer
    `)
    await queryRunner.query(`
      ALTER TABLE "sale_items"
      ADD COLUMN IF NOT EXISTS "serial_unit_id" uuid
    `)
    await queryRunner.query(`
      ALTER TABLE "sale_items"
      ADD COLUMN IF NOT EXISTS "serial_number" character varying(30)
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "product_serial_units" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "business_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "variant_id" uuid,
        "serial_number" character varying(30) NOT NULL,
        "serial_type" character varying(20) NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'IN_STOCK',
        "reserved_at" TIMESTAMP WITH TIME ZONE,
        "reserved_by" uuid,
        "purchase_price" integer NOT NULL DEFAULT 0,
        "supplier_id" uuid,
        "restock_id" uuid,
        "sale_id" uuid,
        "sale_item_id" uuid,
        "sold_at" TIMESTAMP WITH TIME ZONE,
        "customer_id" uuid,
        "warranty_expires_at" TIMESTAMP WITH TIME ZONE,
        "notes" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_product_serial_units_id" PRIMARY KEY ("id"),
        CONSTRAINT "chk_serial_unit_status"
          CHECK ("status" IN ('IN_STOCK', 'SOLD', 'RESERVED', 'RETURNED', 'DAMAGED')),
        CONSTRAINT "uq_serial_number_per_business" UNIQUE ("business_id", "serial_number")
      )
    `)
    await queryRunner.query(`
      ALTER TABLE "product_serial_units"
      ADD CONSTRAINT "fk_serial_units_business_id"
      FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `)
    await queryRunner.query(`
      ALTER TABLE "product_serial_units"
      ADD CONSTRAINT "fk_serial_units_product_id"
      FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
    `)
    await queryRunner.query(`
      ALTER TABLE "product_serial_units"
      ADD CONSTRAINT "fk_serial_units_variant_id"
      FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_serial_units_product_id" ON "product_serial_units" ("product_id")
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_serial_units_variant_id" ON "product_serial_units" ("variant_id")
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_serial_units_business_id" ON "product_serial_units" ("business_id")
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_serial_units_status" ON "product_serial_units" ("status")
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_serial_units_serial" ON "product_serial_units" ("serial_number")
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_serial_units_reserved_at"
      ON "product_serial_units" ("reserved_at") WHERE "status" = 'RESERVED'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "product_serial_units"`)
    await queryRunner.query(`ALTER TABLE "sale_items" DROP COLUMN IF EXISTS "serial_number"`)
    await queryRunner.query(`ALTER TABLE "sale_items" DROP COLUMN IF EXISTS "serial_unit_id"`)
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "warranty_months"`)
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "serial_type"`)
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "is_serialized"`)
  }
}
