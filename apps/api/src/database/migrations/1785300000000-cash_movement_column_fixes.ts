import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Fix two cash_movements columns that break real sync (BIZ-2.3):
 *  - `kind` was varchar(20); the transfer kinds (e.g. TRANSFER_TO_ORANGE_MONEY, 24 chars)
 *    overflow it → "value too long". Widen to varchar(40).
 *  - `reference_id` was uuid, but a debt's id can be a synthetic composite (e.g.
 *    "debt:sale:<uuid>") pulled from sync, which is not a valid uuid → "invalid input
 *    syntax for type uuid". Relax it to varchar so any reference id fits.
 *
 * DBs created after the source migrations were corrected already have these types; the
 * ALTERs are then no-ops.
 */
export class CashMovementColumnFixes1785300000000 implements MigrationInterface {
  name = 'CashMovementColumnFixes1785300000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "cash_movements" ALTER COLUMN "kind" TYPE character varying(40)`,
    )
    await queryRunner.query(
      `ALTER TABLE "cash_movements" ALTER COLUMN "reference_id" TYPE character varying(80)`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // No revert — narrowing back could truncate existing data.
  }
}
