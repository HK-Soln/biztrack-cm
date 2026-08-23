import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * BIZ-5.1 — business calendar foundation.
 *
 * 1. `businesses.timezone` + `businesses.day_cutover_time` — the canonical per-business
 *    local-time settings. `timezone` becomes the ONE source of truth for every local-time
 *    decision (business_date, digest send time, quiet hours); it is seeded from the existing
 *    `notification_settings.timezone` so current users keep their choice, after which the
 *    notifications code reads the business column and the notification_settings one goes
 *    dormant. `day_cutover_time` (HH:mm, default 00:00) sets when the trading day rolls over.
 *
 * 2. `business_date` (DATE) on every transaction table — the local trading day a transaction
 *    belongs to, stamped at write time (never recomputed at read, since the cutover is a
 *    mutable setting). Nullable: historical rows have none and reports fall back to their
 *    existing date; new rows are stamped by the write paths (BIZ-5.1 slice 2). Sales are
 *    back-filled from `sale_date` since that grain already exists.
 */
export class BusinessCalendarBusinessDate1786900000000 implements MigrationInterface {
  // Every transaction table gets business_date (mirrors the BIZ-5.8 set + cash_sessions).
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
    'cash_sessions',
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
    // 1. Business calendar settings.
    await queryRunner.query(`
      ALTER TABLE "businesses"
        ADD COLUMN IF NOT EXISTS "timezone" character varying(64) NOT NULL DEFAULT 'Africa/Douala',
        ADD COLUMN IF NOT EXISTS "day_cutover_time" character varying(5) NOT NULL DEFAULT '00:00'
    `)
    // Seed the canonical timezone from the notifications one so nothing changes for users who
    // already picked a zone (notification_settings.timezone then becomes dormant).
    await queryRunner.query(`
      UPDATE "businesses" b
        SET "timezone" = ns."timezone"
        FROM "notification_settings" ns
        WHERE ns."business_id" = b."id"
          AND ns."timezone" IS NOT NULL
          AND ns."timezone" <> ''
    `)

    // 2. business_date on every transaction table.
    for (const table of this.tables) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "business_date" date`,
      )
    }
    // Back-fill sales from the existing sale_date grain (exact; other tables stay null and
    // fall back at read until the reports slice migrates them).
    await queryRunner.query(
      `UPDATE "sales" SET "business_date" = "sale_date" WHERE "business_date" IS NULL`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of this.tables) {
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "business_date"`)
    }
    await queryRunner.query(`
      ALTER TABLE "businesses"
        DROP COLUMN IF EXISTS "timezone",
        DROP COLUMN IF EXISTS "day_cutover_time"
    `)
  }
}
