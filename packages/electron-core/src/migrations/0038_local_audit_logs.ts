import type { Migration } from './runner'

/**
 * Local, append-only audit trail (per docs/AUDIT_AND_EVENTS_SPEC §12). Every
 * mutating action (create/update/delete) on a business entity writes one row so
 * owners can see who changed what, offline. `synced_at` stays NULL until the row
 * is pushed to the server audit log (sync of these is a later phase).
 */
export const migration_0038: Migration = {
  id: 38,
  name: '0038_local_audit_logs',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS local_audit_logs (
        id           TEXT PRIMARY KEY,
        business_id  TEXT NOT NULL,
        actor_id     TEXT,
        actor_type   TEXT NOT NULL DEFAULT 'USER',
        actor_name   TEXT,
        actor_role   TEXT,
        action       TEXT NOT NULL,
        entity_type  TEXT NOT NULL,
        entity_id    TEXT NOT NULL,
        entity_label TEXT,
        changes      TEXT,
        device_id    TEXT,
        created_at   TEXT NOT NULL,
        synced_at    TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_local_audit_business
        ON local_audit_logs(business_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_local_audit_entity
        ON local_audit_logs(business_id, entity_type, entity_id);
      CREATE INDEX IF NOT EXISTS idx_local_audit_unsynced
        ON local_audit_logs(synced_at) WHERE synced_at IS NULL;
    `)
  },
}
