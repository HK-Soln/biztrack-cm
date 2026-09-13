import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Spec 07 build-order 2 — per-business provider credentials (envelope-encrypted). Server-only: this
 * table must NEVER be synced. Credentials/webhook secret are stored as bytea (AES-256-GCM ciphertext,
 * AAD = business_id); only the key_version, fingerprint and last_four are non-secret metadata.
 */
export class BusinessPaymentProviders1788100000000 implements MigrationInterface {
  name = 'BusinessPaymentProviders1788100000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "business_payment_providers" (
        "id"                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "business_id"               uuid NOT NULL,
        "provider_code"             text NOT NULL,
        "encrypted_credentials"     bytea NOT NULL,
        "key_version"               int NOT NULL,
        "fingerprint"               text,
        "last_four"                 varchar(8),
        "status"                    varchar(24) NOT NULL,
        "verified_methods"          jsonb NOT NULL DEFAULT '[]'::jsonb,
        "last_verified_at"          timestamptz,
        "verification_error"        text,
        "webhook_token"             text,
        "webhook_secret_encrypted"  bytea,
        "created_by"                uuid,
        "created_at"                timestamptz NOT NULL DEFAULT now(),
        "updated_at"                timestamptz NOT NULL DEFAULT now(),
        "deleted_at"                timestamptz,
        CONSTRAINT "fk_business_payment_providers_business"
          FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_business_payment_providers_provider"
          FOREIGN KEY ("provider_code") REFERENCES "payment_providers"("code"),
        CONSTRAINT "unq_business_payment_providers_business_provider"
          UNIQUE ("business_id", "provider_code")
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_business_payment_providers_business" ON "business_payment_providers" ("business_id")`,
    )
    // The webhook token resolves the tenant on inbound provider callbacks — unique when present.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "unq_business_payment_providers_webhook_token" ON "business_payment_providers" ("webhook_token") WHERE "webhook_token" IS NOT NULL`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "business_payment_providers"`)
  }
}
