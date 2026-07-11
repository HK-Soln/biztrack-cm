import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Replace the full (case-sensitive, deleted-inclusive) uniqueness on attribute groups/options
 * with partial, case-insensitive unique indexes among NON-DELETED rows:
 *   - group name unique per business (case-insensitive)
 *   - option value unique per group (case-insensitive)
 * This blocks duplicate names/values while allowing a name to be reused after soft-delete.
 */
export class AttributeUniquenessCi1783300000000 implements MigrationInterface {
  name = 'AttributeUniquenessCi1783300000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "attribute_groups" DROP CONSTRAINT IF EXISTS "uq_attribute_group_name"`,
    )
    await queryRunner.query(
      `ALTER TABLE "attribute_options" DROP CONSTRAINT IF EXISTS "uq_attribute_option_value"`,
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_attribute_group_name_ci"
       ON "attribute_groups" ("business_id", LOWER("name")) WHERE "deleted_at" IS NULL`,
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_attribute_option_value_ci"
       ON "attribute_options" ("group_id", LOWER("value")) WHERE "deleted_at" IS NULL`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_attribute_option_value_ci"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_attribute_group_name_ci"`)
    await queryRunner.query(
      `ALTER TABLE "attribute_options" ADD CONSTRAINT "uq_attribute_option_value" UNIQUE ("group_id", "value")`,
    )
    await queryRunner.query(
      `ALTER TABLE "attribute_groups" ADD CONSTRAINT "uq_attribute_group_name" UNIQUE ("business_id", "name")`,
    )
  }
}
