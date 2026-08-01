import type { Migration } from './runner'
import { ensureColumn } from './runner'

/**
 * Categories carry a default unit of measure (local mirror of the API schema — see
 * apps/api/.../1783800000000-category_default_unit.ts). It is pre-filled when creating a
 * product in the category. Nullable; no FK locally (units sync separately).
 */
export const migration_0054: Migration = {
  id: 54,
  name: '0054_category_default_unit',
  up(db) {
    ensureColumn(
      db,
      'product_categories',
      'default_unit_of_measure_id',
      'default_unit_of_measure_id TEXT',
    )
  },
}
