import type { Migration } from './runner'
import { ensureColumn } from './runner'

/**
 * BIZ-2.9 (foundation, SQLite side) — a monotonic per-device event counter on
 * `local_audit_logs`. The desktop stamps `sequence = MAX(sequence)+1` per device on each
 * insert; a gap or rewind reveals dropped/reordered events.
 *
 * The append-only content guard from 0071 is recreated to also freeze `sequence` (it is set
 * once at insert and must never change). No clock-skew column on the device — server_time is
 * always NULL locally, so skew is derived on the server (generated column) when the row is
 * ingested.
 */
export const migration_0072: Migration = {
  id: 72,
  name: '0072_audit_sequence',
  up(db) {
    ensureColumn(db, 'local_audit_logs', 'sequence', 'INTEGER')
    db.exec(`DROP TRIGGER IF EXISTS trg_local_audit_logs_no_update;`)
    db.exec(`
      CREATE TRIGGER trg_local_audit_logs_no_update
        BEFORE UPDATE ON local_audit_logs FOR EACH ROW
        WHEN (
          NEW.id IS NOT OLD.id OR NEW.business_id IS NOT OLD.business_id
          OR NEW.actor_id IS NOT OLD.actor_id OR NEW.actor_type IS NOT OLD.actor_type
          OR NEW.actor_name IS NOT OLD.actor_name OR NEW.actor_role IS NOT OLD.actor_role
          OR NEW.action IS NOT OLD.action OR NEW.entity_type IS NOT OLD.entity_type
          OR NEW.entity_id IS NOT OLD.entity_id OR NEW.entity_label IS NOT OLD.entity_label
          OR NEW.changes IS NOT OLD.changes OR NEW.device_id IS NOT OLD.device_id
          OR NEW.amount IS NOT OLD.amount OR NEW.cash_session_id IS NOT OLD.cash_session_id
          OR NEW.created_at IS NOT OLD.created_at OR NEW.device_time IS NOT OLD.device_time
          OR NEW.sequence IS NOT OLD.sequence
        )
        BEGIN SELECT RAISE(ABORT, 'local_audit_logs is append-only'); END;
    `)
  },
}
