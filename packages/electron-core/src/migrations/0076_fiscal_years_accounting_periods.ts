import type { Migration } from './runner'

/**
 * BIZ-5.2 (SQLite side) — fiscal_years + accounting_periods, populated by the sync PULL (the API
 * generates them; the desktop reads them locally). No businesses column is added: the fiscal
 * start month is the API's generation input, not needed offline. Columns mirror the pull maps.
 */
export const migration_0076: Migration = {
  id: 76,
  name: '0076_fiscal_years_accounting_periods',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS fiscal_years (
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL,
        year INTEGER NOT NULL,
        label TEXT NOT NULL,
        start_month INTEGER NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        created_at TEXT,
        updated_at TEXT,
        deleted_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_fiscal_years_business ON fiscal_years (business_id);

      CREATE TABLE IF NOT EXISTS accounting_periods (
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL,
        fiscal_year_id TEXT NOT NULL,
        period_number INTEGER NOT NULL,
        label TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'OPEN',
        closed_at TEXT,
        created_at TEXT,
        updated_at TEXT,
        deleted_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_accounting_periods_business ON accounting_periods (business_id);
      CREATE INDEX IF NOT EXISTS idx_accounting_periods_fiscal_year ON accounting_periods (fiscal_year_id);
    `)
  },
}
