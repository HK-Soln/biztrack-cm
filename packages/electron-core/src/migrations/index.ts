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
import { migration_0031 } from './0031_brands_models'
import { migration_0032 } from './0032_product_brand_model'
import { migration_0033 } from './0033_product_scalar_fields'
import { migration_0034 } from './0034_product_images'
import { migration_0035 } from './0035_product_variants'
import { migration_0036 } from './0036_product_meta_variant_stock'
import { migration_0037 } from './0037_product_serial_units'
import { migration_0038 } from './0038_local_audit_logs'
import { migration_0039 } from './0039_rfqs'
import { migration_0040 } from './0040_purchase_orders'
import { migration_0041 } from './0041_restock_po_variant'
import { migration_0042 } from './0042_rfq_quote_file'
import { migration_0043 } from './0043_restock_settlement'
import { migration_0044 } from './0044_contact_email'
import { migration_0045 } from './0045_contact_kyc'
import { migration_0046 } from './0046_serial_unit_sold'
import { migration_0047 } from './0047_expense_status'
import { migration_0048 } from './0048_expense_method_nullable'
import { migration_0049 } from './0049_deposit_sessions'
import { migration_0050 } from './0050_online_sale_flow'
import { migration_0051 } from './0051_backfill_opening_balance_debts'
import { migration_0052 } from './0052_drop_stale_savings_unique'
import { migration_0053 } from './0053_variant_sku_unique'
import { migration_0054 } from './0054_category_default_unit'
import { migration_0055 } from './0055_product_image_variant'
import { migration_0056 } from './0056_variant_seo'
import { migration_0057 } from './0057_unique_serial_items'
import { migration_0058 } from './0058_variant_reorder_point'
import { migration_0059 } from './0059_inventory_movement_variant'
import { migration_0060 } from './0060_whole_xaf_money'
import { migration_0061 } from './0061_business_members_pin'
import { migration_0062 } from './0062_sale_item_listed_price_cart_alloc'
import { migration_0063 } from './0063_sale_discount_reason_authz'
import { migration_0064 } from './0064_role_can_authorize'
import { migration_0065 } from './0065_role_discount_limits'
import { migration_0066 } from './0066_cash_sessions'
import { migration_0067 } from './0067_cash_movements'
import { migration_0068 } from './0068_role_tracks_cash_drawer'
import { migration_0069 } from './0069_cash_session_variance_reason'
import { migration_0070 } from './0070_audit_log_time_amount'
import { migration_0071 } from './0071_append_only_guards'
import { migration_0072 } from './0072_audit_sequence'
import { migration_0073 } from './0073_audit_prune_delete'

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
  migration_0031,
  migration_0032,
  migration_0033,
  migration_0034,
  migration_0035,
  migration_0036,
  migration_0037,
  migration_0038,
  migration_0039,
  migration_0040,
  migration_0041,
  migration_0042,
  migration_0043,
  migration_0044,
  migration_0045,
  migration_0046,
  migration_0047,
  migration_0048,
  migration_0049,
  migration_0050,
  migration_0051,
  migration_0052,
  migration_0053,
  migration_0054,
  migration_0055,
  migration_0056,
  migration_0057,
  migration_0058,
  migration_0059,
  migration_0060,
  migration_0061,
  migration_0062,
  migration_0063,
  migration_0064,
  migration_0065,
  migration_0066,
  migration_0067,
  migration_0068,
  migration_0069,
  migration_0070,
  migration_0071,
  migration_0072,
  migration_0073,
]

export { runMigrations, ensureColumn } from './runner'
export type { Migration } from './runner'
