import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Spec 07 build-order 5 — payment_attempts: the mutable provider-execution record. Server-only
 * (never synced). Money is (amount_minor, currency). Retries are new rows (unique idempotency_key).
 */
export class PaymentAttempts1788300000000 implements MigrationInterface {
  name = 'PaymentAttempts1788300000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payment_attempts" (
        "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "business_id"       uuid NOT NULL,
        "sale_id"           uuid,
        "online_order_id"   uuid,
        "cash_session_id"   uuid,
        "payment_method"    varchar(20) NOT NULL,
        "provider_id"       uuid NOT NULL,
        "provider_ref"      text,
        "amount_minor"      bigint NOT NULL,
        "currency"          varchar(3) NOT NULL,
        "fee_minor"         bigint,
        "net_minor"         bigint,
        "status"            varchar(16) NOT NULL,
        "attempt_number"    int NOT NULL DEFAULT 1,
        "idempotency_key"   text NOT NULL,
        "initiation_type"   varchar(16) NOT NULL,
        "customer_phone"    varchar(32),
        "link_url"          text,
        "expires_at"        timestamptz,
        "confirmed_at"      timestamptz,
        "failed_reason"     text,
        "confirmed_by"      uuid,
        "confirmation_type" varchar(16),
        "raw_callback"      jsonb,
        "created_at"        timestamptz NOT NULL DEFAULT now(),
        "updated_at"        timestamptz NOT NULL DEFAULT now(),
        "deleted_at"        timestamptz,
        CONSTRAINT "unq_payment_attempts_idempotency_key" UNIQUE ("idempotency_key"),
        CONSTRAINT "fk_payment_attempts_business"
          FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_payment_attempts_provider"
          FOREIGN KEY ("provider_id") REFERENCES "business_payment_providers"("id")
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_payment_attempts_business" ON "payment_attempts" ("business_id")`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_payment_attempts_sale" ON "payment_attempts" ("sale_id")`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_payment_attempts_online_order" ON "payment_attempts" ("online_order_id")`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_payment_attempts_provider_ref" ON "payment_attempts" ("provider_ref")`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "payment_attempts"`)
  }
}
