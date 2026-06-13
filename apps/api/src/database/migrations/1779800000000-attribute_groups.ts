import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Phase 3B — attribute groups, options, and category links.
 *
 * display_type is a varchar + CHECK (CHIPS/SWATCHES/DROPDOWN) rather than a PG
 * enum, to avoid enum-type migration churn. category_attribute_groups carries
 * business_id directly (in addition to category_id) for tenant-scoped queries.
 */
export class AttributeGroups1779800000000 implements MigrationInterface {
  name = 'AttributeGroups1779800000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "attribute_groups" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "business_id" uuid NOT NULL,
        "name" character varying(100) NOT NULL,
        "display_type" character varying(20) NOT NULL DEFAULT 'CHIPS',
        "sort_order" integer NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_attribute_groups_id" PRIMARY KEY ("id"),
        CONSTRAINT "chk_attribute_groups_display_type"
          CHECK ("display_type" IN ('CHIPS', 'SWATCHES', 'DROPDOWN')),
        CONSTRAINT "uq_attribute_group_name" UNIQUE ("business_id", "name")
      )
    `)
    await queryRunner.query(`
      ALTER TABLE "attribute_groups"
      ADD CONSTRAINT "fk_attribute_groups_business_id"
      FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_attribute_groups_business"
      ON "attribute_groups" ("business_id")
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "attribute_options" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "group_id" uuid NOT NULL,
        "business_id" uuid NOT NULL,
        "value" character varying(100) NOT NULL,
        "color_hex" character varying(7),
        "sort_order" integer NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_attribute_options_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_attribute_option_value" UNIQUE ("group_id", "value")
      )
    `)
    await queryRunner.query(`
      ALTER TABLE "attribute_options"
      ADD CONSTRAINT "fk_attribute_options_group_id"
      FOREIGN KEY ("group_id") REFERENCES "attribute_groups"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_attribute_options_group"
      ON "attribute_options" ("group_id")
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "category_attribute_groups" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "business_id" uuid NOT NULL,
        "category_id" uuid NOT NULL,
        "attribute_group_id" uuid NOT NULL,
        "is_required" boolean NOT NULL DEFAULT true,
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_category_attribute_groups_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_category_attribute_group" UNIQUE ("category_id", "attribute_group_id")
      )
    `)
    await queryRunner.query(`
      ALTER TABLE "category_attribute_groups"
      ADD CONSTRAINT "fk_category_attribute_groups_category_id"
      FOREIGN KEY ("category_id") REFERENCES "product_categories"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `)
    await queryRunner.query(`
      ALTER TABLE "category_attribute_groups"
      ADD CONSTRAINT "fk_category_attribute_groups_attribute_group_id"
      FOREIGN KEY ("attribute_group_id") REFERENCES "attribute_groups"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_cat_attr_groups_category"
      ON "category_attribute_groups" ("category_id")
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_cat_attr_groups_business"
      ON "category_attribute_groups" ("business_id")
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "category_attribute_groups"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "attribute_options"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "attribute_groups"`)
  }
}
