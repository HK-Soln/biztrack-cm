import type { Migration } from './runner'
import { ensureColumn } from './runner'

/**
 * Cash sessions & denomination count lines (BIZ-2.1, Epic 2 — SQLite side).
 *
 * Mirrors the Postgres `cash_sessions` / `cash_count_lines` tables. Money columns are
 * INTEGER whole XAF (new money is integer by decision D1); the same BEFORE INSERT/UPDATE
 * guard-trigger idiom as migration 0060 rejects any non-whole write, giving the SQLite
 * store the same guarantee Postgres gets from `bigint`.
 *
 * Also threads a nullable `cash_session_id` onto sales, sale_discounts, expenses and
 * local_audit_logs (the device-side audit table) so a row can be tagged to its shift.
 */

const MONEY_COLUMNS = [
  'opening_float',
  'expected_cash',
  'counted_cash',
  'variance_cash',
  'expected_mtn_momo',
  'confirmed_mtn_momo',
  'expected_orange_money',
  'confirmed_orange_money',
  'credit_issued',
  'discount_total',
]

export const migration_0066: Migration = {
  id: 66,
  name: '0066_cash_sessions',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS cash_sessions (
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL,
        outlet_id TEXT,
        device_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'OPEN',
        opened_at TEXT NOT NULL,
        closed_at TEXT,
        opening_float INTEGER NOT NULL DEFAULT 0,
        expected_cash INTEGER,
        counted_cash INTEGER,
        variance_cash INTEGER,
        expected_mtn_momo INTEGER,
        confirmed_mtn_momo INTEGER,
        expected_orange_money INTEGER,
        confirmed_orange_money INTEGER,
        credit_issued INTEGER NOT NULL DEFAULT 0,
        discount_total INTEGER NOT NULL DEFAULT 0,
        sales_count INTEGER NOT NULL DEFAULT 0,
        void_count INTEGER NOT NULL DEFAULT 0,
        closed_reason TEXT,
        recount_used INTEGER NOT NULL DEFAULT 0,
        closing_note TEXT,
        reviewed_by TEXT,
        reviewed_at TEXT,
        review_note TEXT,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_cash_sessions_business_status
        ON cash_sessions (business_id, status);
      CREATE INDEX IF NOT EXISTS idx_cash_sessions_business_updated_at
        ON cash_sessions (business_id, updated_at);
      CREATE INDEX IF NOT EXISTS idx_cash_sessions_business_user
        ON cash_sessions (business_id, user_id);

      CREATE TABLE IF NOT EXISTS cash_count_lines (
        id TEXT PRIMARY KEY,
        cash_session_id TEXT NOT NULL REFERENCES cash_sessions(id) ON DELETE CASCADE,
        denomination INTEGER NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 0,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_cash_count_lines_session
        ON cash_count_lines (cash_session_id);
    `)

    // Whole-XAF guard triggers on the cash_sessions money columns (same idiom as 0060).
    const guard = MONEY_COLUMNS.map(
      (col) => `(NEW.${col} IS NOT NULL AND NEW.${col} <> round(NEW.${col}))`,
    ).join(' OR ')
    const message = 'cash_sessions: money amounts must be whole XAF'
    for (const event of ['INSERT', 'UPDATE'] as const) {
      db.exec(
        `CREATE TRIGGER IF NOT EXISTS trg_cash_sessions_whole_xaf_${event.toLowerCase()} ` +
          `BEFORE ${event} ON cash_sessions FOR EACH ROW WHEN ${guard} ` +
          `BEGIN SELECT RAISE(ABORT, '${message}'); END`,
      )
    }

    // Nullable shift tag on the transactional tables.
    ensureColumn(db, 'sales', 'cash_session_id', 'TEXT')
    ensureColumn(db, 'sale_discounts', 'cash_session_id', 'TEXT')
    ensureColumn(db, 'expenses', 'cash_session_id', 'TEXT')
    ensureColumn(db, 'local_audit_logs', 'cash_session_id', 'TEXT')
  },
}
