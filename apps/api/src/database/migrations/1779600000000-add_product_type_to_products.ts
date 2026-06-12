import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Fix 2 — introduce the authoritative `product_type` enum on products.
 *
 * `isService` / `trackInventory` are kept for backward compatibility and become
 * derived from `productType` via an entity hook. Existing rows are classified:
 *   is_service = true  -> SERVICE
 *   otherwise          -> SIMPLE
 *
 * The column keeps a DB-level DEFAULT 'SIMPLE' (the spec drops it) so no insert
 * path can hit a NOT NULL violation; the entity hook still sets it explicitly.
 */
export class AddProductTypeToProducts1779600000000 implements MigrationInterface {
  name = 'AddProductTypeToProducts1779600000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "product_type_enum" AS ENUM ('SIMPLE', 'SERVICE', 'VARIABLE_QUANTITY', 'COMPOSITE')
    `)

    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "product_type" "product_type_enum" NOT NULL DEFAULT 'SIMPLE'
    `)

    await queryRunner.query(`
      UPDATE "products"
      SET "product_type" = CASE
        WHEN "is_service" = true THEN 'SERVICE'::"product_type_enum"
        ELSE 'SIMPLE'::"product_type_enum"
      END
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "product_type"`)
    await queryRunner.query(`DROP TYPE IF EXISTS "product_type_enum"`)
  }
}
