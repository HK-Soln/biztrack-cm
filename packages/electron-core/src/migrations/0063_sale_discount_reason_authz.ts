import type { Migration } from './runner'
import { ensureColumn } from './runner'

/**
 * BIZ-1.2 (device): reason + authorization metadata on sale_discounts. Mirrors the
 * API columns. sale_item_id (line-vs-cart scope) and the free-form discount_type
 * already exist — no new table, no type change.
 */
export const migration_0063: Migration = {
  id: 63,
  name: '0063_sale_discount_reason_authz',
  up(db) {
    ensureColumn(db, 'sale_discounts', 'reason_code', 'TEXT')
    ensureColumn(db, 'sale_discounts', 'reason_note', 'TEXT')
    ensureColumn(db, 'sale_discounts', 'applied_by', 'TEXT')
    ensureColumn(db, 'sale_discounts', 'authorized_by', 'TEXT')
    ensureColumn(db, 'sale_discounts', 'unauthorized', 'INTEGER NOT NULL DEFAULT 0')
    ensureColumn(db, 'sale_discounts', 'below_cost', 'INTEGER NOT NULL DEFAULT 0')
  },
}
