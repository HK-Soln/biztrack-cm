import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Expenses follow-up (mirrors income `1789300000000`) — expense categories become PER-BUSINESS
 * (editable, owned rows) instead of system-wide, and gain an `is_recurring` flag (selecting a
 * category defaults a new expense to recurring, so it isn't re-set every time).
 *
 * Steps: (0) add the `is_recurring` column; (1) seed the defaults for every existing business
 * (idempotent by business + slug), matching the previously system-wide slugs so booked expenses
 * re-point cleanly; (2) re-point any expense still referencing a system (business_id NULL) category
 * to the business's own category of the same slug (fallback: its 'divers'); (3) drop the shared
 * system rows. New businesses are seeded on creation (BusinessService → ExpenseCategoriesService.seedDefaults).
 */
export class ExpenseCategoriesPerBusiness1789900000000 implements MigrationInterface {
  name = 'ExpenseCategoriesPerBusiness1789900000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 0. Add the recurring flag.
    await queryRunner.query(
      `ALTER TABLE "expense_categories" ADD COLUMN IF NOT EXISTS "is_recurring" boolean NOT NULL DEFAULT false`,
    )

    // 1. Seed the default categories for every existing business (idempotent by business + slug).
    await queryRunner.query(`
      INSERT INTO "expense_categories" ("id", "business_id", "name", "slug", "color", "sort_order", "is_recurring", "created_at", "updated_at")
      SELECT gen_random_uuid(), b."id", d."name", d."slug", d."color", d."sort_order", d."is_recurring", now(), now()
      FROM "businesses" b
      CROSS JOIN (VALUES
        ('Loyer', 'loyer', '#378ADD', 1, true),
        ('Salaires', 'salaires', '#1D9E75', 2, true),
        ('Électricité & Eau', 'electricite-eau', '#EF9F27', 3, false),
        ('Transport', 'transport', '#D85A30', 4, false),
        ('Entretien', 'entretien', '#7F77DD', 5, false),
        ('Divers', 'divers', '#888780', 6, false)
      ) AS d("name", "slug", "color", "sort_order", "is_recurring")
      WHERE NOT EXISTS (
        SELECT 1 FROM "expense_categories" ec
        WHERE ec."business_id" = b."id" AND ec."slug" = d."slug"
      )
    `)

    // 2. Re-point any expense still referencing a system (business_id NULL) category to the business's
    //    own category of the same slug, falling back to its 'divers'.
    await queryRunner.query(`
      UPDATE "expenses" e
      SET "category_id" = COALESCE(
        (SELECT ec."id" FROM "expense_categories" ec
           WHERE ec."business_id" = e."business_id"
             AND ec."slug" = (SELECT sys."slug" FROM "expense_categories" sys WHERE sys."id" = e."category_id")),
        (SELECT ec2."id" FROM "expense_categories" ec2
           WHERE ec2."business_id" = e."business_id" AND ec2."slug" = 'divers')
      )
      WHERE e."category_id" IN (SELECT "id" FROM "expense_categories" WHERE "business_id" IS NULL)
    `)

    // 3. Drop the now-unused shared system categories.
    await queryRunner.query(`DELETE FROM "expense_categories" WHERE "business_id" IS NULL`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-introducing shared system rows would conflict with the per-business model; only the column is
    // reversible.
    await queryRunner.query(`ALTER TABLE "expense_categories" DROP COLUMN IF EXISTS "is_recurring"`)
  }
}
