import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Spec 07 — make the payment uniqueness rules soft-delete-aware.
 *
 * `business_payment_routes` and `business_payment_providers` are soft-deleted (deleted_at), but their
 * UNIQUE constraints covered ALL rows — so a soft-deleted row still reserved its (business, method) /
 * (business, provider) slot, and re-creating it hit "duplicate key value violates unique constraint".
 * Replace each full-table UNIQUE constraint with a PARTIAL unique index scoped to live rows
 * (`WHERE deleted_at IS NULL`), matching the existing `unq_..._webhook_token` precedent. One live row
 * per key is still enforced; any number of soft-deleted tombstones may coexist.
 */
export class PaymentSoftDeleteUniqueIndexes1788800000000 implements MigrationInterface {
  name = 'PaymentSoftDeleteUniqueIndexes1788800000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "business_payment_routes" DROP CONSTRAINT IF EXISTS "unq_business_payment_routes_business_method"`,
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "unq_business_payment_routes_business_method" ON "business_payment_routes" ("business_id", "payment_method") WHERE "deleted_at" IS NULL`,
    )

    await queryRunner.query(
      `ALTER TABLE "business_payment_providers" DROP CONSTRAINT IF EXISTS "unq_business_payment_providers_business_provider"`,
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "unq_business_payment_providers_business_provider" ON "business_payment_providers" ("business_id", "provider_code") WHERE "deleted_at" IS NULL`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverting to full-table constraints can fail if soft-deleted duplicates exist; down is
    // best-effort and normally only used on a fresh dev DB.
    await queryRunner.query(
      `DROP INDEX IF EXISTS "unq_business_payment_providers_business_provider"`,
    )
    await queryRunner.query(
      `ALTER TABLE "business_payment_providers" ADD CONSTRAINT "unq_business_payment_providers_business_provider" UNIQUE ("business_id", "provider_code")`,
    )
    await queryRunner.query(`DROP INDEX IF EXISTS "unq_business_payment_routes_business_method"`)
    await queryRunner.query(
      `ALTER TABLE "business_payment_routes" ADD CONSTRAINT "unq_business_payment_routes_business_method" UNIQUE ("business_id", "payment_method")`,
    )
  }
}
