import type { Migration } from './runner'

/**
 * Expenses follow-up — expense categories become per-business + gain a stored `is_recurring` flag
 * (selecting the category defaults a new expense to recurring). Adds the local column; categories
 * themselves arrive via sync from the API (which seeds per-business + drops the old system rows).
 * The previously locally-seeded system rows (business_id NULL) are left in place but hidden by the
 * now per-business list query — harmless, and safe against expenses that still reference them until
 * the re-pointed rows sync down.
 */
export const migration_0082: Migration = {
  id: 82,
  name: '0082_expense_category_recurring',
  up(db) {
    const cols = db.prepare(`PRAGMA table_info(expense_categories)`).all() as Array<{ name: string }>
    if (!cols.some((c) => c.name === 'is_recurring')) {
      db.exec(`ALTER TABLE expense_categories ADD COLUMN is_recurring INTEGER NOT NULL DEFAULT 0`)
    }
  },
}
