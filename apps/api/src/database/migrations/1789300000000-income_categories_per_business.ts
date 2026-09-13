import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Spec 10 ① — income categories are PER-BUSINESS (editable, owned rows), not system-wide, so a business
 * can carry its own per-category attributes (mirroring the expenses direction — recurring differs per
 * business). This converts the initial system-seeded categories: seed the defaults for every existing
 * business, re-point any income already booked against a system category to the business's own category
 * of the same slug, then drop the shared system rows. New businesses are seeded on creation
 * (BusinessService.seedDefaults → IncomeService.seedDefaults).
 */
export class IncomeCategoriesPerBusiness1789300000000 implements MigrationInterface {
  name = 'IncomeCategoriesPerBusiness1789300000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Seed the default categories for every existing business (idempotent by business + slug).
    await queryRunner.query(`
      INSERT INTO "income_categories" ("id", "business_id", "name", "slug", "color", "sort_order", "created_at", "updated_at")
      SELECT gen_random_uuid(), b."id", d."name", d."slug", d."color", d."sort_order", now(), now()
      FROM "businesses" b
      CROSS JOIN (VALUES
        ('Delivery fees', 'delivery-fees', '#0EA5E9', 10),
        ('Deposit charges', 'deposit-charges', '#8B5CF6', 20),
        ('Miscellaneous', 'miscellaneous', '#64748B', 30)
      ) AS d("name", "slug", "color", "sort_order")
      WHERE NOT EXISTS (
        SELECT 1 FROM "income_categories" ic
        WHERE ic."business_id" = b."id" AND ic."slug" = d."slug"
      )
    `)

    // 2. Re-point any other_income row still referencing a system (business_id NULL) category to the
    //    business's own category of the same slug, falling back to its 'miscellaneous'.
    await queryRunner.query(`
      UPDATE "other_incomes" oi
      SET "category_id" = COALESCE(
        (SELECT ic."id" FROM "income_categories" ic
           WHERE ic."business_id" = oi."business_id"
             AND ic."slug" = (SELECT sys."slug" FROM "income_categories" sys WHERE sys."id" = oi."category_id")),
        (SELECT ic2."id" FROM "income_categories" ic2
           WHERE ic2."business_id" = oi."business_id" AND ic2."slug" = 'miscellaneous')
      )
      WHERE oi."category_id" IN (SELECT "id" FROM "income_categories" WHERE "business_id" IS NULL)
    `)

    // 3. Drop the now-unused shared system categories.
    await queryRunner.query(`DELETE FROM "income_categories" WHERE "business_id" IS NULL`)
  }

  public async down(): Promise<void> {
    // No-op: re-introducing shared system rows would conflict with the per-business model.
  }
}
