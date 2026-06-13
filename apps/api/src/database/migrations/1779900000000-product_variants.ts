import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Phase 3C — attribute-driven product variants.
 *
 * - product_variants: one row per sellable configuration (e.g. "Black 128GB").
 *   price_override / cost_price_override are integers (XAF is zero-decimal);
 *   NULL means inherit from the parent product.
 * - product_variant_options: normalized link from a variant to one attribute
 *   option per group (replaces a free-form JSONB attributes column).
 * - products.has_variants flags variant products.
 * - inventory_levels / sale_items / restock_items gain a nullable variant_id.
 *   inventory_levels uniqueness becomes two partial unique indexes so non-variant
 *   products keep one row per product while variant products get one row each.
 */
export class ProductVariants1779900000000 implements MigrationInterface {
  name = 'ProductVariants1779900000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---- product_variants --------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "product_variants" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "business_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "name" character varying NOT NULL,
        "display_name_override" character varying(200),
        "price_override" integer,
        "cost_price_override" integer,
        "sku" character varying(100),
        "barcode" character varying(100),
        "is_active" boolean NOT NULL DEFAULT true,
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_product_variants_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_variant_name_per_product" UNIQUE ("product_id", "name")
      )
    `)
    await queryRunner.query(`
      ALTER TABLE "product_variants"
      ADD CONSTRAINT "fk_product_variants_business_id"
      FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `)
    await queryRunner.query(`
      ALTER TABLE "product_variants"
      ADD CONSTRAINT "fk_product_variants_product_id"
      FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_product_variants_product_id"
      ON "product_variants" ("product_id")
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_product_variants_business_id"
      ON "product_variants" ("business_id")
    `)

    // ---- product_variant_options ------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "product_variant_options" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "variant_id" uuid NOT NULL,
        "attribute_group_id" uuid NOT NULL,
        "attribute_option_id" uuid NOT NULL,
        "business_id" uuid NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_product_variant_options_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_variant_option_per_group" UNIQUE ("variant_id", "attribute_group_id")
      )
    `)
    await queryRunner.query(`
      ALTER TABLE "product_variant_options"
      ADD CONSTRAINT "fk_variant_options_variant_id"
      FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `)
    await queryRunner.query(`
      ALTER TABLE "product_variant_options"
      ADD CONSTRAINT "fk_variant_options_group_id"
      FOREIGN KEY ("attribute_group_id") REFERENCES "attribute_groups"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
    `)
    await queryRunner.query(`
      ALTER TABLE "product_variant_options"
      ADD CONSTRAINT "fk_variant_options_option_id"
      FOREIGN KEY ("attribute_option_id") REFERENCES "attribute_options"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_variant_options_variant"
      ON "product_variant_options" ("variant_id")
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_variant_options_option"
      ON "product_variant_options" ("attribute_option_id")
    `)

    // ---- products.has_variants --------------------------------------------
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "has_variants" boolean NOT NULL DEFAULT false
    `)

    // ---- inventory_levels.variant_id + partial unique indexes -------------
    await queryRunner.query(`
      ALTER TABLE "inventory_levels"
      ADD COLUMN IF NOT EXISTS "variant_id" uuid
    `)
    await queryRunner.query(`
      ALTER TABLE "inventory_levels"
      DROP CONSTRAINT IF EXISTS "unq_inventory_levels_business_id_product_id"
    `)
    await queryRunner.query(`
      ALTER TABLE "inventory_levels"
      ADD CONSTRAINT "fk_inventory_levels_variant_id"
      FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_inventory_no_variant"
      ON "inventory_levels" ("business_id", "product_id")
      WHERE "variant_id" IS NULL
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_inventory_with_variant"
      ON "inventory_levels" ("business_id", "product_id", "variant_id")
      WHERE "variant_id" IS NOT NULL
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_inventory_levels_variant_id"
      ON "inventory_levels" ("variant_id")
    `)

    // ---- sale_items.variant_id --------------------------------------------
    await queryRunner.query(`
      ALTER TABLE "sale_items"
      ADD COLUMN IF NOT EXISTS "variant_id" uuid
    `)
    await queryRunner.query(`
      ALTER TABLE "sale_items"
      ADD CONSTRAINT "fk_sale_items_variant_id"
      FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_sale_items_variant_id"
      ON "sale_items" ("variant_id")
    `)

    // ---- restock_items.variant_id -----------------------------------------
    await queryRunner.query(`
      ALTER TABLE "restock_items"
      ADD COLUMN IF NOT EXISTS "variant_id" uuid
    `)
    await queryRunner.query(`
      ALTER TABLE "restock_items"
      ADD CONSTRAINT "fk_restock_items_variant_id"
      FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_restock_items_variant_id"
      ON "restock_items" ("variant_id")
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // restock_items
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_restock_items_variant_id"`)
    await queryRunner.query(
      `ALTER TABLE "restock_items" DROP CONSTRAINT IF EXISTS "fk_restock_items_variant_id"`,
    )
    await queryRunner.query(`ALTER TABLE "restock_items" DROP COLUMN IF EXISTS "variant_id"`)

    // sale_items
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_sale_items_variant_id"`)
    await queryRunner.query(
      `ALTER TABLE "sale_items" DROP CONSTRAINT IF EXISTS "fk_sale_items_variant_id"`,
    )
    await queryRunner.query(`ALTER TABLE "sale_items" DROP COLUMN IF EXISTS "variant_id"`)

    // inventory_levels
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_inventory_levels_variant_id"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_inventory_with_variant"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_inventory_no_variant"`)
    await queryRunner.query(
      `ALTER TABLE "inventory_levels" DROP CONSTRAINT IF EXISTS "fk_inventory_levels_variant_id"`,
    )
    await queryRunner.query(`ALTER TABLE "inventory_levels" DROP COLUMN IF EXISTS "variant_id"`)
    // Restore the original non-partial unique constraint (only valid once
    // variant rows are gone, which the column drop above guarantees).
    await queryRunner.query(`
      ALTER TABLE "inventory_levels"
      ADD CONSTRAINT "unq_inventory_levels_business_id_product_id"
      UNIQUE ("business_id", "product_id")
    `)

    // products
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "has_variants"`)

    // variant tables
    await queryRunner.query(`DROP TABLE IF EXISTS "product_variant_options"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "product_variants"`)
  }
}
