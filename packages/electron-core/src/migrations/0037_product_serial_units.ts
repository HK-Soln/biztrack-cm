import type { Migration } from './runner'
import { ensureColumn } from './runner'

/**
 * Sync-readiness for product_serial_units (created in 0028): add the soft-delete
 * flag the sync upsert/pull relies on, plus a per-business uniqueness guard so a
 * serial number can't be entered twice while it is live.
 */
export const migration_0037: Migration = {
  id: 37,
  name: '0037_product_serial_units',
  up(db) {
    ensureColumn(db, 'product_serial_units', 'is_deleted', 'INTEGER NOT NULL DEFAULT 0')
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_psu_variant
        ON product_serial_units(variant_id, is_deleted);
      CREATE INDEX IF NOT EXISTS idx_psu_business
        ON product_serial_units(business_id, is_deleted);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_psu_serial
        ON product_serial_units(business_id, serial_number) WHERE is_deleted = 0;
    `)
  },
}
