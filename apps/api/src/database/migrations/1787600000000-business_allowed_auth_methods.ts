import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * BIZ-3.3 slice 4 — per-business allowed authorization methods (PIN / CARD). null = both (the
 * default); a shop fully on cards can set ['CARD'] to drop the PIN.
 */
export class BusinessAllowedAuthMethods1787600000000 implements MigrationInterface {
  name = 'BusinessAllowedAuthMethods1787600000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "allowed_auth_methods" jsonb
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "businesses" DROP COLUMN IF EXISTS "allowed_auth_methods"`)
  }
}
