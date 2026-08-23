import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * audit_logs.entity_id can hold composite (non-uuid) ids — e.g. a debt materialized
 * from a sale is `debt:sale:<uuid>`. The column was uuid, so the desktop→API audit
 * push (POST /sync/audit) failed with "invalid input syntax for type uuid" for those
 * rows. Widen it to varchar to match the local ledger's TEXT entity_id.
 */
export class AuditEntityIdVarchar1786300000000 implements MigrationInterface {
  name = 'AuditEntityIdVarchar1786300000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ALTER COLUMN "entity_id" TYPE varchar(128) USING "entity_id"::text`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverting requires every entity_id to be a valid uuid; composite ids would fail.
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ALTER COLUMN "entity_id" TYPE uuid USING "entity_id"::uuid`,
    )
  }
}
