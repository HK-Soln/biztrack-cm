import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * BIZ-3.3 — member_auth_credentials: the one home for authorization credentials (PIN + scannable
 * cards). Existing PINs on business_members are backfilled as PIN-type rows; the pin_* columns are
 * kept dormant for one release (a mixed-version device might still read them) and dropped later.
 */
export class MemberAuthCredentials1787500000000 implements MigrationInterface {
  name = 'MemberAuthCredentials1787500000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "member_auth_credentials" (
        "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "member_id"    uuid NOT NULL,
        "business_id"  uuid NOT NULL,
        "user_id"      uuid NOT NULL,
        "type"         varchar(16) NOT NULL,
        "secret_hash"  text NOT NULL,
        "version"      int NOT NULL DEFAULT 0,
        "issued_by_id" uuid,
        "label"        text,
        "revoked_at"   timestamptz,
        "created_at"   timestamptz NOT NULL DEFAULT now(),
        "updated_at"   timestamptz NOT NULL DEFAULT now(),
        "deleted_at"   timestamptz,
        CONSTRAINT "fk_member_auth_credentials_member"
          FOREIGN KEY ("member_id") REFERENCES "business_members"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_member_auth_credentials_business"
          FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_member_auth_credentials_business_id" ON "member_auth_credentials" ("business_id")`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_member_auth_credentials_member_id" ON "member_auth_credentials" ("member_id")`,
    )

    // Backfill existing PINs as PIN-type credentials (idempotent: skip members that already have one).
    await queryRunner.query(`
      INSERT INTO "member_auth_credentials"
        (member_id, business_id, user_id, type, secret_hash, version, created_at, updated_at)
      SELECT m."id", m."business_id", m."user_id", 'PIN', m."pin_hash",
             COALESCE(m."pin_version", 0), COALESCE(m."pin_set_at", now()), now()
      FROM "business_members" m
      WHERE m."pin_hash" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "member_auth_credentials" c
          WHERE c."member_id" = m."id" AND c."type" = 'PIN' AND c."revoked_at" IS NULL
        )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "member_auth_credentials"`)
  }
}
