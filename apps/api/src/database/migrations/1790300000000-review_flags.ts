import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Review flags (rulings R1–R3, docs/design/domain-package.md): things the server accepted
 * from an offline till but the owner should look at — a refund above what was paid, a sale
 * that took stock below zero, a serial unit sold twice. One row per occurrence; the unique
 * (business_id, code, dedupe_key) makes a retried sync idempotent. `outlet_id` is the branch
 * the flag belongs to, filled once branches exist.
 */
export class ReviewFlags1790300000000 implements MigrationInterface {
  name = 'ReviewFlags1790300000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "review_flags" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "business_id" uuid NOT NULL,
        "outlet_id" uuid,
        "code" character varying(40) NOT NULL,
        "severity" character varying(10) NOT NULL,
        "entity_type" character varying(40) NOT NULL,
        "entity_id" uuid NOT NULL,
        "dedupe_key" character varying(200) NOT NULL,
        "details" jsonb NOT NULL DEFAULT '{}',
        "status" character varying(10) NOT NULL DEFAULT 'OPEN',
        "resolved_at" TIMESTAMP WITH TIME ZONE,
        "resolved_by_id" uuid,
        "resolution_note" text,
        CONSTRAINT "pk_review_flags" PRIMARY KEY ("id"),
        CONSTRAINT "fk_review_flags_business_id" FOREIGN KEY ("business_id")
          REFERENCES "businesses"("id") ON DELETE CASCADE
      )
    `)
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "unq_review_flags_business_code_dedupe"
         ON "review_flags" ("business_id", "code", "dedupe_key")`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_review_flags_business_status"
         ON "review_flags" ("business_id", "status", "created_at")`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_review_flags_entity"
         ON "review_flags" ("business_id", "entity_type", "entity_id")`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "review_flags"`)
  }
}
