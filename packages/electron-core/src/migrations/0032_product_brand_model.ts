import type { Migration } from './runner'
import { ensureColumn } from './runner'

/** Local mirror: link products to a brand + model (both optional). */
export const migration_0032: Migration = {
  id: 32,
  name: '0032_product_brand_model',
  up(db) {
    ensureColumn(db, 'products', 'brand_id', 'brand_id TEXT')
    ensureColumn(db, 'products', 'model_id', 'model_id TEXT')
    db.exec(`CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand_id)`)
  },
}
