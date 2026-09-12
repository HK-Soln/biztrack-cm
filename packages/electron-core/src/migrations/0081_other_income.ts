import type { Migration } from './runner'

/**
 * Spec 10 ① — local Other Income ledger, mirroring the API's other_incomes + income_categories so
 * manual other-income entries work offline (local write → outbox → sync) and the income statement can
 * read the line locally. Categories follow the expense_categories shape (null business_id = system).
 */
export const migration_0081: Migration = {
  id: 81,
  name: '0081_other_income',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS income_categories (
        id          TEXT    PRIMARY KEY,
        business_id TEXT,
        name        TEXT    NOT NULL,
        slug        TEXT,
        color       TEXT,
        icon        TEXT,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        is_active   INTEGER NOT NULL DEFAULT 1,
        is_deleted  INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT    NOT NULL,
        updated_at  TEXT    NOT NULL
      );

      CREATE TABLE IF NOT EXISTS other_incomes (
        id             TEXT    PRIMARY KEY,
        business_id    TEXT    NOT NULL,
        recorded_by_id TEXT,
        category_id    TEXT    NOT NULL,
        description    TEXT    NOT NULL,
        amount         REAL    NOT NULL,
        currency       TEXT    NOT NULL DEFAULT 'XAF',
        payment_method TEXT,
        reference      TEXT,
        source         TEXT    NOT NULL DEFAULT 'MANUAL',
        source_id      TEXT,
        note           TEXT,
        date           TEXT    NOT NULL,
        business_date  TEXT,
        is_deleted     INTEGER NOT NULL DEFAULT 0,
        created_at     TEXT    NOT NULL,
        updated_at     TEXT    NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_income_categories_business ON income_categories(business_id, is_deleted);
      CREATE INDEX IF NOT EXISTS idx_other_incomes_business ON other_incomes(business_id, date);
      CREATE INDEX IF NOT EXISTS idx_other_incomes_business_category ON other_incomes(business_id, category_id, is_deleted);
    `)

    // Seed the shared system categories (business_id NULL) to mirror the API migration seeds, so the
    // Add-other-income picker and the general-link default work offline before the first pull.
    const now = new Date().toISOString()
    const seed = db.prepare(
      `INSERT OR IGNORE INTO income_categories
        (id, business_id, name, slug, color, icon, sort_order, is_active, is_deleted, created_at, updated_at)
       VALUES (?, NULL, ?, ?, ?, NULL, ?, 1, 0, ?, ?)`,
    )
    seed.run('00000000-0000-4000-a000-0000000000d1', 'Delivery fees', 'delivery-fees', '#0EA5E9', 10, now, now)
    seed.run('00000000-0000-4000-a000-0000000000d2', 'Deposit charges', 'deposit-charges', '#8B5CF6', 20, now, now)
    seed.run('00000000-0000-4000-a000-0000000000d3', 'Miscellaneous', 'miscellaneous', '#64748B', 30, now, now)
  },
}
