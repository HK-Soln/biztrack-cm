import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Cash sessions & denomination count lines (BIZ-2.1, Epic 2 — Postgres side).
 *
 * A cash session is a cashier's shift at a till. Money columns are `bigint` whole XAF
 * (new money is integer by decision D1 — a bigint can't hold a fraction, so no
 * decimal + CHECK dance is needed here). Lifecycle OPEN → COUNTING → CLOSED →
 * RECONCILED (+ ABANDONED) is enforced in the service layer; CLOSED is immutable to
 * every role.
 *
 * Also threads a nullable, FK-less `cash_session_id` onto sales, sale_discounts,
 * expenses and audit_logs so a row can be tagged to the shift it belongs to. It is
 * intentionally soft (no FK) — a sale may be rung with no open session ("vente hors
 * caisse", cash_session_id NULL), and a soft ref keeps sync ordering uncoupled.
 */
export class CashSessions1784900000000 implements MigrationInterface {
  name = 'CashSessions1784900000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cash_sessions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "business_id" uuid NOT NULL,
        "outlet_id" uuid,
        "device_id" text NOT NULL,
        "user_id" uuid NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'OPEN',
        "opened_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "closed_at" TIMESTAMP WITH TIME ZONE,
        "opening_float" bigint NOT NULL DEFAULT 0,
        "expected_cash" bigint,
        "counted_cash" bigint,
        "variance_cash" bigint,
        "expected_mtn_momo" bigint,
        "confirmed_mtn_momo" bigint,
        "expected_orange_money" bigint,
        "confirmed_orange_money" bigint,
        "credit_issued" bigint NOT NULL DEFAULT 0,
        "discount_total" bigint NOT NULL DEFAULT 0,
        "sales_count" integer NOT NULL DEFAULT 0,
        "void_count" integer NOT NULL DEFAULT 0,
        "closed_reason" character varying(20),
        "recount_used" boolean NOT NULL DEFAULT false,
        "closing_note" text,
        "reviewed_by" uuid,
        "reviewed_at" TIMESTAMP WITH TIME ZONE,
        "review_note" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "pk_cash_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "fk_cash_sessions_business_id" FOREIGN KEY ("business_id")
          REFERENCES "businesses"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_cash_sessions_user_id" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE NO ACTION,
        CONSTRAINT "fk_cash_sessions_reviewed_by" FOREIGN KEY ("reviewed_by")
          REFERENCES "users"("id") ON DELETE NO ACTION
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_cash_sessions_business_id_status"
      ON "cash_sessions" ("business_id", "status")
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_cash_sessions_business_id_updated_at"
      ON "cash_sessions" ("business_id", "updated_at")
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_cash_sessions_business_id_user_id"
      ON "cash_sessions" ("business_id", "user_id")
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cash_count_lines" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "cash_session_id" uuid NOT NULL,
        "denomination" integer NOT NULL,
        "quantity" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "pk_cash_count_lines" PRIMARY KEY ("id"),
        CONSTRAINT "fk_cash_count_lines_cash_session_id" FOREIGN KEY ("cash_session_id")
          REFERENCES "cash_sessions"("id") ON DELETE CASCADE
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_cash_count_lines_cash_session_id"
      ON "cash_count_lines" ("cash_session_id")
    `)

    // Nullable, FK-less shift tag on the transactional tables.
    for (const table of ['sales', 'sale_discounts', 'expenses', 'audit_logs']) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "cash_session_id" uuid`,
      )
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['sales', 'sale_discounts', 'expenses', 'audit_logs']) {
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "cash_session_id"`)
    }
    await queryRunner.query(`DROP TABLE IF EXISTS "cash_count_lines"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "cash_sessions"`)
  }
}
