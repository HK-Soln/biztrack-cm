import type { Migration } from './runner'
import { ensureColumn } from './runner'

/**
 * Ruling R2 (device): remember which version of the role's discount limits each sale was
 * made under. `roles.limits_version` arrives with the roles sync pull; the sale keeps the
 * role and version it was checked against, and sends them with the sale so the server can
 * tell a till that still had old limits from a discount that went over the limit.
 */
export const migration_0084: Migration = {
  id: 84,
  name: '0084_discount_limits_version',
  up(db) {
    ensureColumn(db, 'roles', 'limits_version', 'INTEGER')
    ensureColumn(db, 'sales', 'discount_role_id', 'TEXT')
    ensureColumn(db, 'sales', 'discount_limits_version', 'INTEGER')
  },
}
