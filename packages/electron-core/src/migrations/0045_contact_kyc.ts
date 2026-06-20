import type { Migration } from './runner'
import { ensureColumn } from './runner'

/** Optional KYC / identification data on a contact (mainly customers on credit):
 * document type/number, issue & expiry dates, uploaded document files (JSON array of
 * URLs), and an optional selfie photo. Used for audit + recovery on troublesome clients. */
export const migration_0045: Migration = {
  id: 45,
  name: '0045_contact_kyc',
  up(db) {
    ensureColumn(db, 'contacts', 'id_type', 'TEXT')
    ensureColumn(db, 'contacts', 'id_number', 'TEXT')
    ensureColumn(db, 'contacts', 'id_issue_date', 'TEXT')
    ensureColumn(db, 'contacts', 'id_expiry_date', 'TEXT')
    ensureColumn(db, 'contacts', 'id_documents', 'TEXT') // JSON array of file URLs
    ensureColumn(db, 'contacts', 'selfie_url', 'TEXT')
  },
}
