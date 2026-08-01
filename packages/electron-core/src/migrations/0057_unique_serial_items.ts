import type { Migration } from './runner'
import { ensureColumn } from './runner'

/**
 * Unique-item mode: a serialized product can mark each unit as unique, so every serial unit
 * becomes a mini-product with its own image/description/SEO. Local mirror of the API schema
 * (see apps/api/.../*-unique_serial_items.ts). All nullable/defaulted.
 */
export const migration_0057: Migration = {
  id: 57,
  name: '0057_unique_serial_items',
  up(db) {
    ensureColumn(db, 'products', 'unique_items', 'unique_items INTEGER NOT NULL DEFAULT 0')
    ensureColumn(db, 'product_serial_units', 'description', 'description TEXT')
    ensureColumn(db, 'product_serial_units', 'image_url', 'image_url TEXT')
    ensureColumn(db, 'product_serial_units', 'meta_title', 'meta_title TEXT')
    ensureColumn(db, 'product_serial_units', 'meta_description', 'meta_description TEXT')
  },
}
