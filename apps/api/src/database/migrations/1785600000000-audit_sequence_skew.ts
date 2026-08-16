import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * BIZ-2.9 (foundation) — make audit_logs record pre-business/system events, and add
 * tamper-evidence metadata.
 *
 * - business_id becomes nullable so a pre-business event (e.g. FAILED_LOGIN before a business
 *   is selected) is recorded instead of silently dropped by the service guard.
 * - `sequence` — a monotonic per-device event counter (carried up by the audit bridge).
 * - `clock_skew` — a generated flag, true when the device clock ran ahead of the server ingest
 *   time (device_time > server_time). Computed by the DB; the app never writes it.
 */
export class AuditSequenceSkew1785600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "audit_logs" ALTER COLUMN "business_id" DROP NOT NULL`)
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "sequence" bigint`)
    await queryRunner.query(`
      ALTER TABLE "audit_logs"
        ADD COLUMN IF NOT EXISTS "clock_skew" boolean
        GENERATED ALWAYS AS (
          "device_time" IS NOT NULL AND "server_time" IS NOT NULL AND "device_time" > "server_time"
        ) STORED
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "clock_skew"`)
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "sequence"`)
    // Best-effort restore of the NOT NULL (only succeeds if no null-business rows exist).
    await queryRunner.query(
      `UPDATE "audit_logs" SET "business_id" = '00000000-0000-0000-0000-000000000000' WHERE "business_id" IS NULL`,
    )
    await queryRunner.query(`ALTER TABLE "audit_logs" ALTER COLUMN "business_id" SET NOT NULL`)
  }
}
