import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Brands & Models. A brand links to categories many-to-many (brand_categories)
 * and owns models. Product brand_id/model_id wiring lands with the Products slice.
 */
export class BrandsModels1780900000000 implements MigrationInterface {
  name = 'BrandsModels1780900000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "brands" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "business_id" uuid NOT NULL,
        "name" character varying(120) NOT NULL,
        "slug" character varying(140) NOT NULL,
        "logo_url" character varying,
        "description" text,
        "is_active" boolean NOT NULL DEFAULT true,
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_brands_id" PRIMARY KEY ("id"),
        CONSTRAINT "unq_brands_business_id_slug" UNIQUE ("business_id", "slug")
      )
    `)
    await queryRunner.query(`
      ALTER TABLE "brands" ADD CONSTRAINT "fk_brands_business_id"
      FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_brands_business_id_deleted_at"
      ON "brands" ("business_id", "deleted_at")
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "models" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "business_id" uuid NOT NULL,
        "brand_id" uuid NOT NULL,
        "name" character varying(120) NOT NULL,
        "slug" character varying(140),
        "is_active" boolean NOT NULL DEFAULT true,
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_models_id" PRIMARY KEY ("id"),
        CONSTRAINT "unq_models_brand_id_name" UNIQUE ("brand_id", "name")
      )
    `)
    await queryRunner.query(`
      ALTER TABLE "models" ADD CONSTRAINT "fk_models_brand_id"
      FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_models_business_id_deleted_at"
      ON "models" ("business_id", "deleted_at")
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "brand_categories" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "business_id" uuid NOT NULL,
        "brand_id" uuid NOT NULL,
        "category_id" uuid NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_brand_categories_id" PRIMARY KEY ("id"),
        CONSTRAINT "unq_brand_category" UNIQUE ("brand_id", "category_id")
      )
    `)
    await queryRunner.query(`
      ALTER TABLE "brand_categories" ADD CONSTRAINT "fk_brand_categories_brand_id"
      FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `)
    await queryRunner.query(`
      ALTER TABLE "brand_categories" ADD CONSTRAINT "fk_brand_categories_category_id"
      FOREIGN KEY ("category_id") REFERENCES "product_categories"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_brand_categories_business_id"
      ON "brand_categories" ("business_id")
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "brand_categories"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "models"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "brands"`)
  }
}
