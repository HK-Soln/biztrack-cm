import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Whole-XAF money enforcement (BIZ-0.2, Postgres side).
 *
 * XAF is a zero-decimal currency, so no money column may hold a fractional value.
 * For every money column this migration (1) rounds existing rows to whole XAF
 * (`round()`, half away from zero) to repair any legacy sub-unit drift, then
 * (2) adds a `CHECK (col IS NULL OR col = round(col))` constraint so no future
 * write can store a fraction. Column types stay `decimal(_,2)` (no type change);
 * the constraint, not the scale, is the guarantee.
 *
 * EXCLUDED — never money: quantities, rates/percentages (tax_rate,
 * default_vat_rate, *_rate, *_rate_value), the polymorphic
 * charge_types.default_value, and plan_configs prices (already integer).
 *
 * Every statement is guarded by table/column existence so the migration is safe
 * across schema variants and re-runnable.
 */

const MONEY_COLUMNS: Record<string, string[]> = {
  products: ['price', 'cost_price'],
  sales: [
    'subtotal',
    'discount_amount',
    'charges_amount',
    'tax_amount',
    'total_amount',
    'amount_paid',
    'credit_amount',
    'change_given',
  ],
  sale_items: ['unit_price', 'discount_amount', 'line_total', 'total_price', 'cost_price'],
  sale_payments: ['amount'],
  sale_returns: ['refund_amount'],
  sale_charges: ['amount'],
  sale_discounts: ['amount'],
  expenses: ['amount'],
  savings_accounts: [
    'balance',
    'total_deposited',
    'total_refunded',
    'total_used',
    'total_transferred',
  ],
  savings_transactions: ['amount'],
  restock_records: [
    'total_cost',
    'discount_amount',
    'charges_amount',
    'total_amount',
    'amount_paid',
    'credit_amount',
  ],
  restock_items: ['unit_cost'],
  restock_payments: ['amount'],
  restock_charges: ['amount'],
  restock_discounts: ['amount'],
  debts: ['original_amount'],
  debt_payments: ['amount'],
  contact_opening_balances: ['amount'],
  purchase_orders: ['total_amount'],
  purchase_order_items: ['unit_price'],
  rfq_suppliers: ['quoted_total'],
  daily_sale_summaries: [
    'total_revenue',
    'total_cost',
    'gross_profit',
    'total_discounts',
    'cash_collected',
    'mtn_momo_collected',
    'orange_money_collected',
    'card_collected',
    'credit_issued',
    'voided_amount',
  ],
  monthly_expense_summaries: ['total_amount', 'recurring_amount'],
}

const constraintName = (table: string, col: string) => `chk_${table}_${col}_whole_xaf`

export class WholeXafMoney1784300000000 implements MigrationInterface {
  name = 'WholeXafMoney1784300000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [table, columns] of Object.entries(MONEY_COLUMNS)) {
      for (const col of columns) {
        // 1. Round existing fractional values to whole XAF (guarded by existence).
        await queryRunner.query(`
          DO $$
          BEGIN
            IF EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name = '${table}' AND column_name = '${col}'
            ) THEN
              EXECUTE 'UPDATE "${table}" SET "${col}" = round("${col}") '
                   || 'WHERE "${col}" IS DISTINCT FROM round("${col}")';
            END IF;
          END $$;
        `)

        // 2. Add the whole-XAF CHECK constraint if not already present.
        const constraint = constraintName(table, col)
        await queryRunner.query(`
          DO $$
          BEGIN
            IF EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name = '${table}' AND column_name = '${col}'
            ) AND NOT EXISTS (
              SELECT 1 FROM pg_constraint WHERE conname = '${constraint}'
            ) THEN
              EXECUTE 'ALTER TABLE "${table}" ADD CONSTRAINT "${constraint}" '
                   || 'CHECK ("${col}" IS NULL OR "${col}" = round("${col}"))';
            END IF;
          END $$;
        `)
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [table, columns] of Object.entries(MONEY_COLUMNS)) {
      for (const col of columns) {
        await queryRunner.query(
          `ALTER TABLE IF EXISTS "${table}" DROP CONSTRAINT IF EXISTS "${constraintName(table, col)}"`,
        )
      }
    }
  }
}
