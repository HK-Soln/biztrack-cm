import { contactNameKey } from '@biztrack/domain'
import type { Migration } from './runner'
import { ensureColumn } from './runner'

/**
 * Ruling R16 (device): a contact's name is unique in its business, compared by its slug
 * (@biztrack/domain contactNameKey), as on the server (API migration 1790700000000). Adds
 * `contacts.name_key` and a unique index on (business_id, name_key). Contacts that already
 * share a name keep their names; the second and later ones get a numbered key.
 */
export const migration_0086: Migration = {
  id: 86,
  name: '0086_contact_name_key',
  up(db) {
    ensureColumn(db, 'contacts', 'name_key', 'TEXT')
    const rows = db
      .prepare(`SELECT id, business_id, name FROM contacts ORDER BY business_id, created_at, id`)
      .all() as Array<{ id: string; business_id: string; name: string }>
    const setKey = db.prepare(`UPDATE contacts SET name_key = ? WHERE id = ?`)
    const taken = new Map<string, Set<string>>()
    for (const row of rows) {
      const keys = taken.get(row.business_id) ?? new Set<string>()
      taken.set(row.business_id, keys)
      const base = contactNameKey(row.name ?? '') || 'contact'
      let key = base
      for (let n = 2; keys.has(key); n += 1) key = `${base}-${n}`
      keys.add(key)
      setKey.run(key, row.id)
    }
    db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS unq_contacts_business_name_key ON contacts (business_id, name_key)`,
    )
  },
}
