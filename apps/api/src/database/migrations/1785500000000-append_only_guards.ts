import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * BIZ-2.8 — DB-level append-only enforcement (Postgres). Immutability is enforced by the
 * database, not application code: a raw UPDATE/DELETE is rejected regardless of how the row
 * is reached.
 *
 * The app connects as the table owner, and an owner bypasses table-level GRANT/REVOKE — so
 * REVOKE would be a no-op. A BEFORE UPDATE/DELETE trigger that RAISEs is role-independent and
 * is the reliable mechanism here.
 *
 * Scope:
 * - `audit_logs`    — fully immutable (never updated or deleted).
 * - `sale_payments` — immutable on the server; it is INSERT-only (refunds are appended as a
 *                     new REFUND-kind row, never an edit). debt_payments is intentionally NOT
 *                     guarded here: its sync applier still delete+replaces a debt's payment set,
 *                     so a hard lock needs the reversal-based sync refactor first (deletePayment
 *                     is already converted to a reversing entry in this change).
 */
export class AppendOnlyGuards1785500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION biztrack_append_only_guard() RETURNS trigger AS $func$
      BEGIN
        RAISE EXCEPTION 'append-only: % on % is not permitted', TG_OP, TG_TABLE_NAME
          USING ERRCODE = 'restrict_violation';
      END;
      $func$ LANGUAGE plpgsql
    `)

    for (const table of ['audit_logs', 'sale_payments']) {
      await queryRunner.query(
        `CREATE TRIGGER "trg_${table}_no_update" BEFORE UPDATE ON "${table}"
           FOR EACH ROW EXECUTE FUNCTION biztrack_append_only_guard()`,
      )
      await queryRunner.query(
        `CREATE TRIGGER "trg_${table}_no_delete" BEFORE DELETE ON "${table}"
           FOR EACH ROW EXECUTE FUNCTION biztrack_append_only_guard()`,
      )
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['audit_logs', 'sale_payments']) {
      await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_${table}_no_update" ON "${table}"`)
      await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_${table}_no_delete" ON "${table}"`)
    }
    await queryRunner.query(`DROP FUNCTION IF EXISTS biztrack_append_only_guard()`)
  }
}
