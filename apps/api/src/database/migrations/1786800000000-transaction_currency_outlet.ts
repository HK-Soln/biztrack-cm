import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * BIZ-5.8 — nullable `currency_code` + `outlet_id` on every transaction table.
 *
 * Unused today (single-currency XAF, single-outlet), but added now because these columns
 * are trivial to add and painful to retrofit once historical rows exist. Attribution
 * (which outlet a transaction belongs to, in which currency) is written by the later Epic 5
 * / multi-outlet stories; this slice only lands the columns so they're ready.
 *
 * `cash_sessions` already carries `outlet_id` (BIZ-2.1) → it gets only `currency_code`.
 * Excluded on purpose: junction/event/state/derived/draft tables (rfq_suppliers,
 * online_order_events, inventory_levels, *_summaries, online_carts) and all master data.
 *
 * Nullable soft columns, no FK, no CHECK, no trigger — safe and reversible.
 */
export class TransactionCurrencyOutlet1786800000000 implements MigrationInterface {
  // Transaction tables that get BOTH columns.
  private readonly tables = [
    'sales',
    'sale_items',
    'sale_payments',
    'sale_charges',
    'sale_discounts',
    'sale_returns',
    'sale_return_items',
    'expenses',
    'debts',
    'debt_payments',
    'contact_opening_balances',
    'cash_movements',
    'cash_count_lines',
    'savings_accounts',
    'savings_transactions',
    'inventory_movements',
    'stock_movements',
    'restock_records',
    'restock_items',
    'restock_payments',
    'restock_charges',
    'restock_discounts',
    'rfqs',
    'rfq_items',
    'purchase_orders',
    'purchase_order_items',
    'online_orders',
  ]

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of this.tables) {
      await queryRunner.query(`
        ALTER TABLE "${table}"
          ADD COLUMN IF NOT EXISTS "currency_code" character varying(3),
          ADD COLUMN IF NOT EXISTS "outlet_id" uuid
      `)
    }
    // cash_sessions already has outlet_id (BIZ-2.1) — only add the currency.
    await queryRunner.query(
      `ALTER TABLE "cash_sessions" ADD COLUMN IF NOT EXISTS "currency_code" character varying(3)`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of this.tables) {
      await queryRunner.query(`
        ALTER TABLE "${table}"
          DROP COLUMN IF EXISTS "currency_code",
          DROP COLUMN IF EXISTS "outlet_id"
      `)
    }
    await queryRunner.query(`ALTER TABLE "cash_sessions" DROP COLUMN IF EXISTS "currency_code"`)
  }
}
