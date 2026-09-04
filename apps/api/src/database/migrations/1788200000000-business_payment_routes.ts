import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Spec 07 build-order 4 — per-business payment routing. One provider per method (unique constraint),
 * and a composite FK to payment_provider_capabilities so a route can only reference a (provider,
 * method, country) that actually exists in the catalogue.
 */
export class BusinessPaymentRoutes1788200000000 implements MigrationInterface {
  name = 'BusinessPaymentRoutes1788200000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "business_payment_routes" (
        "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "business_id"   uuid NOT NULL,
        "payment_method" varchar(20) NOT NULL,
        "provider_id"   uuid NOT NULL,
        "provider_code" text NOT NULL,
        "country_code"  varchar(2) NOT NULL,
        "is_enabled"    boolean NOT NULL DEFAULT true,
        "created_at"    timestamptz NOT NULL DEFAULT now(),
        "updated_at"    timestamptz NOT NULL DEFAULT now(),
        "deleted_at"    timestamptz,
        CONSTRAINT "unq_business_payment_routes_business_method"
          UNIQUE ("business_id", "payment_method"),
        CONSTRAINT "fk_business_payment_routes_provider"
          FOREIGN KEY ("provider_id") REFERENCES "business_payment_providers"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_business_payment_routes_capability"
          FOREIGN KEY ("provider_code", "payment_method", "country_code")
          REFERENCES "payment_provider_capabilities"("provider_code", "payment_method", "country_code")
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_business_payment_routes_business" ON "business_payment_routes" ("business_id")`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "business_payment_routes"`)
  }
}
