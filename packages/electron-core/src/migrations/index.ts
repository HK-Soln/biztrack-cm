import type { Migration } from './runner'
import { migration_0001 } from './0001_initial_schema'
import { migration_0002 } from './0002_business_members'
import { migration_0003 } from './0003_business_members_role_id'
import { migration_0004 } from './0004_roles'
import { migration_0005 } from './0005_opening_balances'
import { migration_0006 } from './0006_preorders'
import { migration_0007 } from './0007_fix_quantity_reserved'
import { migration_0008 } from './0008_sale_preorder_link'
import { migration_0009 } from './0009_charge_types'
import { migration_0010 } from './0010_sale_discounts'
import { migration_0011 } from './0011_preorder_deposit_balance'
import { migration_0012 } from './0012_preorder_refunds'
import { migration_0013 } from './0013_backfill_deposit_balance'
import { migration_0014 } from './0014_drop_preorders'
import { migration_0015 } from './0015_savings'
import { migration_0016 } from './0016_savings_usage'
import { migration_0017 } from './0017_savings_transactions'
import { migration_0018 } from './0018_local_businesses'
import { migration_0019 } from './0019_local_businesses_extended'
import { migration_0020 } from './0020_local_user_profiles'
import { migration_0021 } from './0021_local_businesses_user_id'
import { migration_0022 } from './0022_category_hierarchy'
import { migration_0023 } from './0023_attribute_groups'
import { migration_0024 } from './0024_product_variants'
import { migration_0025 } from './0025_variant_inventory'
import { migration_0026 } from './0026_product_type'
import { migration_0027 } from './0027_bundle_components'
import { migration_0028 } from './0028_serial_units'
import { migration_0029 } from './0029_outbox_retry'
import { migration_0030 } from './0030_category_description_show_online'

/**
 * Ordered list of all local-SQLite migrations, shared by every consumer of
 * @biztrack/electron-core. Mirrors the API schema for offline-first storage.
 */
export const MIGRATIONS: Migration[] = [
  migration_0001,
  migration_0002,
  migration_0003,
  migration_0004,
  migration_0005,
  migration_0006,
  migration_0007,
  migration_0008,
  migration_0009,
  migration_0010,
  migration_0011,
  migration_0012,
  migration_0013,
  migration_0014,
  migration_0015,
  migration_0016,
  migration_0017,
  migration_0018,
  migration_0019,
  migration_0020,
  migration_0021,
  migration_0022,
  migration_0023,
  migration_0024,
  migration_0025,
  migration_0026,
  migration_0027,
  migration_0028,
  migration_0029,
  migration_0030,
]

export { runMigrations, ensureColumn } from './runner'
export type { Migration } from './runner'
