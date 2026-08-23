import type { Migration } from './runner'
import { ensureColumn } from './runner'

/**
 * BIZ-1.4 (device): mirror the per-role discount limits so the till can evaluate a
 * cashier's discount against their role offline. Values arrive via the roles sync
 * pull; NULL = no limit.
 */
export const migration_0065: Migration = {
  id: 65,
  name: '0065_role_discount_limits',
  up(db) {
    ensureColumn(db, 'roles', 'max_discount_percent', 'REAL')
    ensureColumn(db, 'roles', 'max_cart_discount_percent', 'REAL')
    ensureColumn(db, 'roles', 'max_discount_amount_xaf', 'REAL')
    ensureColumn(db, 'roles', 'allow_below_cost', 'INTEGER NOT NULL DEFAULT 0')
  },
}
