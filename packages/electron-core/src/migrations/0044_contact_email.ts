import type { Migration } from './runner'
import { ensureColumn } from './runner'

/** Store an email address on a contact (used for supplier document delivery + records). */
export const migration_0044: Migration = {
  id: 44,
  name: '0044_contact_email',
  up(db) {
    ensureColumn(db, 'contacts', 'email', 'TEXT')
  },
}
