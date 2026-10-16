import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Ruling R2 (docs/design/domain-package.md): keep every version of a role's discount
 * policy, so a sale synced from a till is checked against the limits in force when it was
 * made. `roles.limits_version` is the current version; the till receives it with the role
 * and sends it back on each sale.
 *
 * Seeded with one row per role holding today's limits, effective from now: recorded
 * history starts the day this runs. A sale made before that has no version to be checked
 * against, and keeps the till's own verdict.
 */
export class RoleLimitVersions1790500000000 implements MigrationInterface {
  name = 'RoleLimitVersions1790500000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "limits_version" integer NOT NULL DEFAULT 1`,
    )
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "role_limit_versions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "business_id" uuid NOT NULL,
        "role_id" uuid NOT NULL,
        "version" integer NOT NULL,
        "max_discount_percent" numeric(5,2),
        "max_cart_discount_percent" numeric(5,2),
        "max_discount_amount_xaf" numeric(12,2),
        "allow_below_cost" boolean NOT NULL DEFAULT false,
        "effective_from" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "pk_role_limit_versions" PRIMARY KEY ("id"),
        CONSTRAINT "fk_role_limit_versions_business_id" FOREIGN KEY ("business_id")
          REFERENCES "businesses"("id") ON DELETE CASCADE
      )
    `)
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "unq_role_limit_versions_role_version"
         ON "role_limit_versions" ("role_id", "version")`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_role_limit_versions_role_effective"
         ON "role_limit_versions" ("role_id", "effective_from")`,
    )
    await queryRunner.query(`
      INSERT INTO "role_limit_versions"
        ("business_id", "role_id", "version", "max_discount_percent",
         "max_cart_discount_percent", "max_discount_amount_xaf", "allow_below_cost",
         "effective_from")
      SELECT r."business_id", r."id", r."limits_version", r."max_discount_percent",
             r."max_cart_discount_percent", r."max_discount_amount_xaf", r."allow_below_cost",
             now()
        FROM "roles" r
      ON CONFLICT ("role_id", "version") DO NOTHING
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "role_limit_versions"`)
    await queryRunner.query(`ALTER TABLE "roles" DROP COLUMN IF EXISTS "limits_version"`)
  }
}
