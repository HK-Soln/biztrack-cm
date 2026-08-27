import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * BIZ-5.7 — business size profile (MICRO | SMALL | SME). Sets defaults and drives profile-aware
 * vocabulary in the client. Defaults to SMALL (the neutral middle) for existing businesses.
 */
export class BusinessProfile1787400000000 implements MigrationInterface {
  name = 'BusinessProfile1787400000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "businesses"
        ADD COLUMN IF NOT EXISTS "profile" varchar(16) NOT NULL DEFAULT 'SMALL'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "businesses" DROP COLUMN IF EXISTS "profile"`)
  }
}
