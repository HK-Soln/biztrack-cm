import type { Migration } from './runner'
import { ensureColumn } from './runner'

/**
 * Cash-variance reason (BIZ-2.6, SQLite side). Mirrors the Postgres columns: a blame-free
 * reason code + optional note captured when a shift closes outside the tolerance band.
 */
export const migration_0069: Migration = {
  id: 69,
  name: '0069_cash_session_variance_reason',
  up(db) {
    ensureColumn(db, 'cash_sessions', 'variance_reason', 'TEXT')
    ensureColumn(db, 'cash_sessions', 'variance_note', 'TEXT')
  },
}
