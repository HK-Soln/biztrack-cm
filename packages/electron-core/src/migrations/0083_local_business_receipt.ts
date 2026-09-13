import type { Migration } from './runner'

/**
 * Cache the receipt-relevant business profile locally so the main process can build receipts offline
 * with the real identity + settings: NIU, the receipt-settings jsonb, and the receipt-number prefix.
 * (phone/email/address/city/logo_url already exist on local_businesses.) Populated from the API
 * profile on fetch/update — the business record is server-owned, not part of the sync set.
 */
export const migration_0083: Migration = {
  id: 83,
  name: '0083_local_business_receipt',
  up(db) {
    const cols = db.prepare(`PRAGMA table_info(local_businesses)`).all() as Array<{ name: string }>
    const has = (c: string) => cols.some((x) => x.name === c)
    if (!has('niu')) db.exec(`ALTER TABLE local_businesses ADD COLUMN niu TEXT`)
    if (!has('receipt_settings')) db.exec(`ALTER TABLE local_businesses ADD COLUMN receipt_settings TEXT`)
    if (!has('receipt_number_prefix'))
      db.exec(`ALTER TABLE local_businesses ADD COLUMN receipt_number_prefix TEXT`)
  },
}
