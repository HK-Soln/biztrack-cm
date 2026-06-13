import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Phase 3F — composite (bundle) products. A COMPOSITE product has no stock of
 * its own; selling one bundle deducts `quantity` of each component product.
 */
export class ProductBundleComponents1780000000000 implements MigrationInterface {
  name = 'ProductBundleComponents1780000000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "product_bundle_components" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "business_id" uuid NOT NULL,
        "bundle_product_id" uuid NOT NULL,
        "component_product_id" uuid NOT NULL,
        "quantity" numeric(12,3) NOT NULL DEFAULT 1,
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_product_bundle_components_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_bundle_component" UNIQUE ("bundle_product_id", "component_product_id"),
        CONSTRAINT "chk_no_self_bundle" CHECK ("bundle_product_id" <> "component_product_id"),
        CONSTRAINT "chk_bundle_quantity_positive" CHECK ("quantity" > 0)
      )
    `)
    await queryRunner.query(`
      ALTER TABLE "product_bundle_components"
      ADD CONSTRAINT "fk_bundle_components_business_id"
      FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `)
    await queryRunner.query(`
      ALTER TABLE "product_bundle_components"
      ADD CONSTRAINT "fk_bundle_components_bundle_id"
      FOREIGN KEY ("bundle_product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `)
    await queryRunner.query(`
      ALTER TABLE "product_bundle_components"
      ADD CONSTRAINT "fk_bundle_components_component_id"
      FOREIGN KEY ("component_product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_bundle_components_bundle"
      ON "product_bundle_components" ("bundle_product_id")
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_bundle_components_component"
      ON "product_bundle_components" ("component_product_id")
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_bundle_components_business"
      ON "product_bundle_components" ("business_id")
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "product_bundle_components"`)
  }
}
