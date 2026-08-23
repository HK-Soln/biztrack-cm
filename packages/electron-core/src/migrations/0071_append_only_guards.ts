import type { Migration } from './runner'

/**
 * BIZ-2.8 — DB-level append-only enforcement (SQLite side). BEFORE UPDATE/DELETE guard
 * triggers RAISE(ABORT), mirroring the Postgres triggers, so tampering is rejected by the
 * database rather than trusted application code.
 *
 * - `local_audit_logs` — content is immutable; only the sync bookkeeping columns
 *   (`synced_at`, `server_time`) may change, so the future desktop→server audit bridge can
 *   still mark a row shipped. DELETE is fully blocked.
 * - `sale_payments` — DELETE is blocked (nothing legitimately deletes a payment). UPDATE is
 *   left allowed because the sync applier re-writes the row idempotently on echo-pull
 *   (`ON CONFLICT(id) DO UPDATE`); blocking it would abort every echo.
 *
 * `debt_payments` is intentionally not guarded: its sync applier still delete+replaces a
 * debt's payment set (that's how a reversal propagates), so a hard lock needs that refactor
 * first — deletePayment is already a reversing entry on the server.
 */
export const migration_0071: Migration = {
  id: 71,
  name: '0071_append_only_guards',
  up(db) {
    db.exec(`
      -- local_audit_logs: immutable content, DELETE blocked. Only synced_at / server_time
      -- (sync bookkeeping) may be updated.
      CREATE TRIGGER IF NOT EXISTS trg_local_audit_logs_no_update
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
        )
        BEGIN SELECT RAISE(ABORT, 'local_audit_logs is append-only'); END;
      CREATE TRIGGER IF NOT EXISTS trg_local_audit_logs_no_delete
        BEFORE DELETE ON local_audit_logs FOR EACH ROW
        BEGIN SELECT RAISE(ABORT, 'local_audit_logs is append-only'); END;

      -- sale_payments: DELETE blocked (UPDATE allowed for the idempotent sync echo).
      CREATE TRIGGER IF NOT EXISTS trg_sale_payments_no_delete
        BEFORE DELETE ON sale_payments FOR EACH ROW
        BEGIN SELECT RAISE(ABORT, 'sale_payments is append-only'); END;
    `)
  },
}
