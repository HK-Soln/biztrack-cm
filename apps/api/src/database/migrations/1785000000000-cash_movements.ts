import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Cash movements (BIZ-2.3, Epic 2 — Postgres side). Every non-sale cash event at a
 * till: expenses paid from the drawer, supplier payments, drops, owner draws, change
 * in/out, credit repayments. `amount` is `bigint` whole XAF (positive); the sign lives
 * in `direction` (IN/OUT/NEUTRAL). Append-only by service discipline.
 *
 * Also adds a nullable, FK-less `cash_movement_id` to `expenses` — the bridge from the
 * till to the P&L: recording an EXPENSE movement creates a linked expense that points
 * back at its movement.
 */
export class CashMovements1785000000000 implements MigrationInterface {
  name = 'CashMovements1785000000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cash_movements" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "business_id" uuid NOT NULL,
        "cash_session_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "kind" character varying(40) NOT NULL,
        "direction" character varying(10) NOT NULL,
        "amount" bigint NOT NULL,
        "note" text,
        "reference_type" character varying(30),
        "reference_id" character varying(80),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "pk_cash_movements" PRIMARY KEY ("id"),
        CONSTRAINT "fk_cash_movements_business_id" FOREIGN KEY ("business_id")
          REFERENCES "businesses"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_cash_movements_cash_session_id" FOREIGN KEY ("cash_session_id")
          REFERENCES "cash_sessions"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_cash_movements_user_id" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE NO ACTION
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_cash_movements_session"
      ON "cash_movements" ("cash_session_id")
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_cash_movements_business_updated_at"
      ON "cash_movements" ("business_id", "updated_at")
    `)

    await queryRunner.query(
      `ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "cash_movement_id" uuid`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "expenses" DROP COLUMN IF EXISTS "cash_movement_id"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "cash_movements"`)
  }
}
