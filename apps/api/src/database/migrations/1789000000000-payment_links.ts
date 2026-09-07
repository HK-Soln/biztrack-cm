import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Spec 08 — payment links. A tokenized link to pay one payable (debt / sale balance / online order /
 * deposit) via the merchant's routed providers. Server-only. One ACTIVE (or PARTIALLY_PAID) link per
 * (business, payable_type, payable_id) for non-deposit payables (partial unique index); DEPOSIT allows
 * many. Adds `payment_link_id` to payment_attempts as the fourth initiation context.
 */
export class PaymentLinks1789000000000 implements MigrationInterface {
  name = 'PaymentLinks1789000000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "payment_links" (
        "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "business_id"       uuid NOT NULL,
        "token"             varchar(64) NOT NULL,
        "payable_type"      varchar(20) NOT NULL,
        "payable_id"        uuid NOT NULL,
        "amount_minor"      bigint NOT NULL,
        "amount_paid_minor" bigint NOT NULL DEFAULT 0,
        "currency"          varchar(3) NOT NULL,
        "allow_partial"     boolean NOT NULL DEFAULT false,
        "status"            varchar(20) NOT NULL,
        "expires_at"        timestamptz NOT NULL,
        "label"             varchar(140),
        "customer_id"       uuid,
        "created_by"        uuid,
        "created_at"        timestamptz NOT NULL DEFAULT now(),
        "updated_at"        timestamptz NOT NULL DEFAULT now(),
        "deleted_at"        timestamptz
      )
    `)
    await queryRunner.query(
      `CREATE INDEX "idx_payment_links_business" ON "payment_links" ("business_id")`,
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_payment_links_token" ON "payment_links" ("token")`,
    )
    await queryRunner.query(
      `CREATE INDEX "idx_payment_links_payable" ON "payment_links" ("business_id", "payable_type", "payable_id")`,
    )
    // One live link per payable for a specific balance (DEPOSIT top-ups are independent → excluded).
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_payment_links_active_payable"
      ON "payment_links" ("business_id", "payable_type", "payable_id")
      WHERE "deleted_at" IS NULL AND "payable_type" <> 'DEPOSIT'
        AND "status" IN ('ACTIVE', 'PARTIALLY_PAID')
    `)
    await queryRunner.query(`ALTER TABLE "payment_attempts" ADD COLUMN "payment_link_id" uuid`)
    await queryRunner.query(
      `CREATE INDEX "idx_payment_attempts_payment_link" ON "payment_attempts" ("payment_link_id")`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_payment_attempts_payment_link"`)
    await queryRunner.query(`ALTER TABLE "payment_attempts" DROP COLUMN IF EXISTS "payment_link_id"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "payment_links"`)
  }
}
