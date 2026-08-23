import type { Migration } from './runner'
import { ensureColumn } from './runner'

/**
 * BIZ-2.7 (SQLite side) — extend `local_audit_logs` with time provenance + a money amount,
 * mirroring the Postgres columns.
 *
 * - `device_time`  the device's own clock (back-filled from created_at for existing rows).
 * - `server_time`  stays NULL on the device; the server stamps it when the row is ingested
 *                  (the desktop→server audit bridge, a later phase).
 * - `amount`       whole-XAF money impact (INTEGER), guarded whole by BEFORE triggers like
 *                  every other money column (0060/0067 idiom).
 */
export const migration_0070: Migration = {
  id: 70,
  name: '0070_audit_log_time_amount',
  up(db) {
    ensureColumn(db, 'local_audit_logs', 'device_time', 'TEXT')
    ensureColumn(db, 'local_audit_logs', 'server_time', 'TEXT')
    ensureColumn(db, 'local_audit_logs', 'amount', 'INTEGER')
    db.exec(`UPDATE local_audit_logs SET device_time = created_at WHERE device_time IS NULL;`)
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_local_audit_logs_whole_xaf_insert
        BEFORE INSERT ON local_audit_logs FOR EACH ROW
        WHEN (NEW.amount IS NOT NULL AND NEW.amount <> round(NEW.amount))
        BEGIN SELECT RAISE(ABORT, 'local_audit_logs: money amounts must be whole XAF'); END;
      CREATE TRIGGER IF NOT EXISTS trg_local_audit_logs_whole_xaf_update
        BEFORE UPDATE ON local_audit_logs FOR EACH ROW
        WHEN (NEW.amount IS NOT NULL AND NEW.amount <> round(NEW.amount))
        BEGIN SELECT RAISE(ABORT, 'local_audit_logs: money amounts must be whole XAF'); END;
    `)
  },
}
