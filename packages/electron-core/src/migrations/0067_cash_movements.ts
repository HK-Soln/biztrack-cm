import type { Migration } from './runner'
import { ensureColumn } from './runner'

/**
 * Cash movements (BIZ-2.3, Epic 2 — SQLite side). Mirrors the Postgres `cash_movements`
 * table; `amount` is INTEGER whole XAF (positive) guarded by the same BEFORE INSERT/UPDATE
 * whole-XAF trigger idiom as migration 0060. Adds the nullable `cash_movement_id` bridge
 * column to `expenses`.
 */
export const migration_0067: Migration = {
  id: 67,
  name: '0067_cash_movements',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS cash_movements (
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL,
        cash_session_id TEXT NOT NULL REFERENCES cash_sessions(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        direction TEXT NOT NULL,
        amount INTEGER NOT NULL,
        note TEXT,
        reference_type TEXT,
        reference_id TEXT,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_cash_movements_session
        ON cash_movements (cash_session_id);
      CREATE INDEX IF NOT EXISTS idx_cash_movements_business_updated_at
        ON cash_movements (business_id, updated_at);
    `)

    // Whole-XAF guard on the amount column (same idiom as 0060).
    for (const event of ['INSERT', 'UPDATE'] as const) {
      db.exec(
        `CREATE TRIGGER IF NOT EXISTS trg_cash_movements_whole_xaf_${event.toLowerCase()} ` +
          `BEFORE ${event} ON cash_movements FOR EACH ROW ` +
          `WHEN (NEW.amount IS NOT NULL AND NEW.amount <> round(NEW.amount)) ` +
          `BEGIN SELECT RAISE(ABORT, 'cash_movements: money amounts must be whole XAF'); END`,
      )
    }

    ensureColumn(db, 'expenses', 'cash_movement_id', 'TEXT')
  },
}
