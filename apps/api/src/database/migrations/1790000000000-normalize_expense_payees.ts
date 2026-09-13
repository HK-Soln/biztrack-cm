import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * One-time cleanup for the case-insensitive payee cache: collapse each business's "Paid to" (vendor)
 * case variants onto a single canonical spelling — the most-used one (ties broken alphabetically).
 * So a business that recorded both "Landlord" and "landlord" ends up with just "Landlord" on every
 * row. Only rows whose casing actually changes are touched, and `updated_at` is bumped so the change
 * propagates to every device through the normal expense sync pull (no separate local migration needed).
 * Idempotent: re-running finds nothing left to change.
 */
export class NormalizeExpensePayees1790000000000 implements MigrationInterface {
  name = 'NormalizeExpensePayees1790000000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      WITH counts AS (
        SELECT business_id, vendor, COUNT(*) AS cnt
        FROM expenses
        WHERE deleted_at IS NULL AND vendor IS NOT NULL AND btrim(vendor) <> ''
        GROUP BY business_id, vendor
      ),
      canonical AS (
        SELECT DISTINCT ON (business_id, LOWER(vendor))
               business_id, LOWER(vendor) AS lv, vendor AS canonical
        FROM counts
        ORDER BY business_id, LOWER(vendor), cnt DESC, vendor ASC
      )
      UPDATE expenses e
      SET vendor = c.canonical, updated_at = now()
      FROM canonical c
      WHERE e.business_id = c.business_id
        AND e.vendor IS NOT NULL
        AND LOWER(e.vendor) = c.lv
        AND e.vendor <> c.canonical
        AND e.deleted_at IS NULL
    `)
  }

  public async down(): Promise<void> {
    // No-op: the original per-row casing isn't recoverable, and reverting would re-introduce the
    // duplicates this migration exists to remove.
  }
}
