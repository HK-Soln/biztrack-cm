import type { Migration } from './runner'

export const migration_0021: Migration = {
  id: 21,
  name: '0021_local_businesses_user_id',
  up(db) {
    const existing = (
      db
        .prepare(`PRAGMA table_info(local_businesses)`)
        .all() as Array<{ name: string }>
    ).map((col) => col.name)

    if (!existing.includes('user_id')) {
      db.exec(`ALTER TABLE local_businesses ADD COLUMN user_id TEXT`)
    }
  },
}
