import type { Migration } from './runner'

/**
 * Spec 10 ① — local Other Income ledger, mirroring the API's other_incomes + income_categories so
 * manual other-income entries work offline (local write → outbox → sync) and the income statement can
 * read the line locally. Categories are per-business (owned rows) — they arrive via sync (no local
 * seed); the shape follows expense_categories.
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
  },
}
