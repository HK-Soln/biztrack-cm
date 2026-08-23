import type { Migration } from './runner'
import { ensureColumn } from './runner'

/**
 * Offline manager-PIN credential (BIZ-3.1), device side. Mirrors the API columns
 * on the local business_members table so a manager's bcrypt PIN hash — pulled
 * down via TeamMemberSyncRecord — can be verified offline for step-up.
 */
export const migration_0061: Migration = {
  id: 61,
  name: '0061_business_members_pin',
  up(db) {
    ensureColumn(db, 'business_members', 'pin_hash', 'TEXT')
    ensureColumn(db, 'business_members', 'pin_version', 'INTEGER NOT NULL DEFAULT 0')
    ensureColumn(db, 'business_members', 'pin_set_at', 'TEXT')
  },
}
