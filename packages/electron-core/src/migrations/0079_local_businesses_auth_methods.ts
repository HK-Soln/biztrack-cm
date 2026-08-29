import type { Migration } from './runner'

/**
 * BIZ-3.3 slice 4 — cache the business's allowed authorization methods (PIN / CARD) locally so the
 * step-up modal and the offline verifier both honour a shop that has dropped the PIN. JSON array
 * text; null/absent ⇒ both methods allowed.
 */
export const migration_0079: Migration = {
  id: 79,
  name: '0079_local_businesses_auth_methods',
  up(db) {
    const existing = (
      db.prepare(`PRAGMA table_info(local_businesses)`).all() as Array<{ name: string }>
    ).map((col) => col.name)
    if (!existing.includes('allowed_auth_methods')) {
      db.exec(`ALTER TABLE local_businesses ADD COLUMN allowed_auth_methods TEXT`)
    }
  },
}
