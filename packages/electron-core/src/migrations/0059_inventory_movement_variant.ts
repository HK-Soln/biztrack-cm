import type { Migration } from './runner'
import { ensureColumn } from './runner'

/**
 * Per-variant stock movements: tag each movement with the variant it affected (null = product
 * level) so a variant's own stock history can be listed. Mirrors the API column of the same name.
 */
export const migration_0059: Migration = {
  id: 59,
  name: '0059_inventory_movement_variant',
  up(db) {
    ensureColumn(db, 'inventory_movements', 'variant_id', 'variant_id TEXT')
  },
}
