import type { Migration } from './runner'
import { ensureColumn } from './runner'

/**
 * Category description + online-store visibility (local mirror of the API schema).
 * `show_online` defaults to 1 so synced categories surface in the online store.
 */
export const migration_0030: Migration = {
  id: 30,
  name: '0030_category_description_show_online',
  up(db) {
    ensureColumn(db, 'product_categories', 'description', 'description TEXT')
    ensureColumn(db, 'product_categories', 'show_online', 'show_online INTEGER NOT NULL DEFAULT 1')
  },
}
