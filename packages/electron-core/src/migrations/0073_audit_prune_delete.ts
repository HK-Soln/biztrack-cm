import type { Migration } from './runner'

/**
 * BIZ-2.10 — allow the audit bridge to prune. The 0071 no-delete guard blocked EVERY delete
 * on `local_audit_logs`, which would abort the 90-day retention prune. Relax it: a row may be
 * deleted only once it has been pushed to the server (`synced_at IS NOT NULL`); an unsynced
 * row is still append-only and cannot be destroyed. The server retains everything.
 */
export const migration_0073: Migration = {
  id: 73,
  name: '0073_audit_prune_delete',
  up(db) {
    db.exec(`DROP TRIGGER IF EXISTS trg_local_audit_logs_no_delete;`)
    db.exec(`
      CREATE TRIGGER trg_local_audit_logs_no_delete
        BEFORE DELETE ON local_audit_logs FOR EACH ROW
        WHEN OLD.synced_at IS NULL
        BEGIN SELECT RAISE(ABORT, 'local_audit_logs is append-only until synced'); END;
    `)
  },
}
