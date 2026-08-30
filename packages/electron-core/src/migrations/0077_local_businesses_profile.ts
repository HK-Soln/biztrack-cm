import type { Migration } from './runner'

/**
 * BIZ-5.7 — cache the business size profile locally so an offline session drives the right
 * profile-aware vocabulary (MICRO | SMALL | SME).
 */
export const migration_0077: Migration = {
  id: 77,
  name: '0077_local_businesses_profile',
  up(db) {
    const existing = (
      db.prepare(`PRAGMA table_info(local_businesses)`).all() as Array<{ name: string }>
    ).map((col) => col.name)
    if (!existing.includes('profile')) {
      db.exec(`ALTER TABLE local_businesses ADD COLUMN profile TEXT`)
    }
  },
}
