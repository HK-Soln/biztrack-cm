import type { Migration } from './runner'

/**
 * Sync retry: a per-record next-attempt timestamp on the outbox so failed/deferred
 * rows back off instead of hammering every cycle. Status values 'deferred' and 'dead'
 * are stored in the existing TEXT `status` column (no schema change for those).
 */
export const migration_0029: Migration = {
  id: 29,
  name: '0029_outbox_retry',
  up(db) {
    db.exec(`
      ALTER TABLE sync_outbox ADD COLUMN next_attempt_at TEXT;
      CREATE INDEX IF NOT EXISTS idx_sync_outbox_next_attempt
        ON sync_outbox(status, next_attempt_at);
    `)
  },
}
