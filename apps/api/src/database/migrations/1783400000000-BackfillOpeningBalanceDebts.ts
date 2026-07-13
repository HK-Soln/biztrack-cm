import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Materialize every existing opening balance as an OPENING_BALANCE debt so it can be paid
 * through the normal debt-payment flow. Idempotent: only inserts where no OPENING_BALANCE debt
 * yet exists for the (business, contact, direction). `source_id = contact_id` matches the
 * runtime materialization (deterministic natural key that converges across desktop + cloud on
 * sync). `created_at` is pinned to the opening-balance `as_of_date` so the debt sorts to the top
 * of the account statement, ahead of later transactions.
 */
export class BackfillOpeningBalanceDebts1783400000000 implements MigrationInterface {
  name = 'BackfillOpeningBalanceDebts1783400000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "debts" (
        "business_id", "contact_id", "direction", "source_type", "source_id",
        "source_reference", "original_amount", "status", "created_at"
      )
      SELECT
        ob."business_id", ob."contact_id", ob."direction", 'OPENING_BALANCE', ob."contact_id",
        'Opening balance', ob."amount", 'OUTSTANDING', (ob."as_of_date")::timestamptz
      FROM "contact_opening_balances" ob
      WHERE NOT EXISTS (
        SELECT 1 FROM "debts" d
        WHERE d."business_id" = ob."business_id"
          AND d."source_type" = 'OPENING_BALANCE'
          AND d."source_id" = ob."contact_id"
          AND d."direction" = ob."direction"
      )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove only opening-balance debts that were never paid against, so no payment history is lost.
    await queryRunner.query(`
      DELETE FROM "debts" d
      WHERE d."source_type" = 'OPENING_BALANCE'
        AND NOT EXISTS (SELECT 1 FROM "debt_payments" p WHERE p."debt_id" = d."id")
    `)
  }
}
