import type { Migration } from './runner'

/**
 * BIZ-3.3 — local member_auth_credentials, the device mirror of the server table (PIN + scannable
 * cards). Pull-only: rows arrive via sync so authorization can be verified offline. No local
 * backfill — the verify path COALESCEs onto the legacy business_members.pin_hash until credentials
 * sync down, so offline PIN keeps working across the migration.
 */
export const migration_0078: Migration = {
  id: 78,
  name: '0078_member_auth_credentials',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS member_auth_credentials (
        id           TEXT PRIMARY KEY,
        member_id    TEXT NOT NULL,
        business_id  TEXT NOT NULL,
        user_id      TEXT NOT NULL,
        type         TEXT NOT NULL,
        secret_hash  TEXT NOT NULL,
        version      INTEGER NOT NULL DEFAULT 0,
        issued_by_id TEXT,
        label        TEXT,
        revoked_at   TEXT,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL,
        deleted_at   TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_member_auth_credentials_business ON member_auth_credentials(business_id);
      CREATE INDEX IF NOT EXISTS idx_member_auth_credentials_member ON member_auth_credentials(member_id);
    `)
  },
}
