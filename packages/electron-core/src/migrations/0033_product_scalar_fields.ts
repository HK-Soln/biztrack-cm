import type { Migration } from './runner'
import { ensureColumn } from './runner'

/** Local mirror: featured flag, online-store fields, and serialized-inventory fields. */
export const migration_0033: Migration = {
  id: 33,
  name: '0033_product_scalar_fields',
  up(db) {
    ensureColumn(db, 'products', 'is_featured', 'is_featured INTEGER NOT NULL DEFAULT 0')
    ensureColumn(db, 'products', 'is_published_online', 'is_published_online INTEGER NOT NULL DEFAULT 0')
    ensureColumn(db, 'products', 'online_description', 'online_description TEXT')
    ensureColumn(db, 'products', 'online_stock_reserve', 'online_stock_reserve INTEGER NOT NULL DEFAULT 0')
    ensureColumn(db, 'products', 'is_serialized', 'is_serialized INTEGER NOT NULL DEFAULT 0')
    ensureColumn(db, 'products', 'serial_type', 'serial_type TEXT')
    ensureColumn(db, 'products', 'warranty_months', 'warranty_months INTEGER')
  },
}
