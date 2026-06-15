import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Sync idempotency: index for the duplicate-resend lookup
 * (device_id + client_operation_id) so re-sent operations are deduped without a scan.
 */
export class SyncOperationIdempotencyIndex1780700000000 implements MigrationInterface {
  name = 'SyncOperationIdempotencyIndex1780700000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_sync_operations_device_client"
      ON "sync_operations" ("device_id", "client_operation_id")
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_sync_operations_device_client"`)
  }
}
