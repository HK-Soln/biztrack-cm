import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * BIZ-2.7 — extend `audit_logs` with time provenance + a denormalised money amount.
 *
 * - `device_time`  the originating device's own clock (client-reported, untrusted).
 * - `server_time`  authoritative ingest time, stamped by the DB (`now()`) — never the client.
 * - `amount`       whole-XAF money impact (bigint; a bigint can't hold a fraction, so no
 *                  CHECK is needed), nullable since most events move no money.
 *
 * Existing rows are back-filled from `created_at` so the new time columns aren't null for
 * history. No `audit_events` table is created (⛔ per the spec) — this only extends the
 * existing append-only table.
 */
export class AuditLogTimeAmount1785400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "audit_logs"
        ADD COLUMN IF NOT EXISTS "device_time" TIMESTAMP,
        ADD COLUMN IF NOT EXISTS "server_time" TIMESTAMP,
        ADD COLUMN IF NOT EXISTS "amount" bigint
    `)
    // Back-fill the time columns from created_at for existing history.
    await queryRunner.query(
      `UPDATE "audit_logs" SET "server_time" = "created_at" WHERE "server_time" IS NULL`,
    )
    await queryRunner.query(
      `UPDATE "audit_logs" SET "device_time" = "created_at" WHERE "device_time" IS NULL`,
    )
    // From now on the DB stamps server_time itself; it becomes NOT NULL.
    await queryRunner.query(`ALTER TABLE "audit_logs" ALTER COLUMN "server_time" SET DEFAULT now()`)
    await queryRunner.query(`ALTER TABLE "audit_logs" ALTER COLUMN "server_time" SET NOT NULL`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "audit_logs"
        DROP COLUMN IF EXISTS "device_time",
        DROP COLUMN IF EXISTS "server_time",
        DROP COLUMN IF EXISTS "amount"
    `)
  }
}
