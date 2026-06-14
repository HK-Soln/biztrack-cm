import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Phase 3H — system audit log. Append-only trail of who did what to which entity.
 * Plain indexed table (monthly partitioning is a future optimisation).
 */
export class AuditLogs1780200000000 implements MigrationInterface {
  name = 'AuditLogs1780200000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "business_id" uuid NOT NULL,
        "actor_id" uuid,
        "actor_type" character varying(20) NOT NULL,
        "actor_name" text,
        "actor_role" text,
        "action" character varying(30) NOT NULL,
        "entity_type" character varying(50) NOT NULL,
        "entity_id" uuid NOT NULL,
        "entity_label" text,
        "changes" jsonb,
        "ip_address" character varying(64),
        "device_id" text,
        "device_type" character varying(20),
        "device_info" jsonb,
        "request_id" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_logs_id" PRIMARY KEY ("id")
      )
    `)
    await queryRunner.query(`
      ALTER TABLE "audit_logs"
      ADD CONSTRAINT "fk_audit_logs_business_id"
      FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_audit_logs_business"
      ON "audit_logs" ("business_id", "created_at")
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_audit_logs_entity"
      ON "audit_logs" ("business_id", "entity_type", "entity_id")
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_audit_logs_actor"
      ON "audit_logs" ("business_id", "actor_id")
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`)
  }
}
