import type { Migration } from './runner'

/** Pending expenses carry no payment method, so payment_method must be nullable.
 * SQLite can't drop a NOT NULL constraint in place — rebuild the table. */
export const migration_0048: Migration = {
  id: 48,
  name: '0048_expense_method_nullable',
  up(db) {
    db.exec(`
      CREATE TABLE expenses_new (
        id              TEXT    PRIMARY KEY,
        business_id     TEXT    NOT NULL,
        recorded_by_id  TEXT    NOT NULL,
        category        TEXT    NOT NULL,
        description     TEXT    NOT NULL,
        amount          REAL    NOT NULL,
        payment_method  TEXT,
        receipt_url     TEXT,
        date            TEXT    NOT NULL,
        is_deleted      INTEGER NOT NULL DEFAULT 0,
        created_at      TEXT    NOT NULL,
        updated_at      TEXT    NOT NULL,
        category_id     TEXT,
        currency        TEXT    NOT NULL DEFAULT 'XAF',
        vendor          TEXT,
        notes           TEXT,
        is_recurring    INTEGER NOT NULL DEFAULT 0,
        status          TEXT    NOT NULL DEFAULT 'PAID'
      );
      INSERT INTO expenses_new
        (id, business_id, recorded_by_id, category, description, amount, payment_method, receipt_url, date,
         is_deleted, created_at, updated_at, category_id, currency, vendor, notes, is_recurring, status)
      SELECT
        id, business_id, recorded_by_id, category, description, amount, payment_method, receipt_url, date,
        is_deleted, created_at, updated_at, category_id, currency, vendor, notes, is_recurring, status
      FROM expenses;
      DROP TABLE expenses;
      ALTER TABLE expenses_new RENAME TO expenses;
      CREATE INDEX IF NOT EXISTS idx_expenses_business_date ON expenses (business_id, date);
    `)
  },
}
