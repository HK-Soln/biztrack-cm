import { MigrationInterface, QueryRunner } from 'typeorm'

/** Add X (Twitter) + LinkedIn social profile fields to online_stores. */
export class OnlineStoreSocials1782400000000 implements MigrationInterface {
  name = 'OnlineStoreSocials1782400000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "online_stores" ADD COLUMN IF NOT EXISTS "social_x" character varying(200)`)
    await queryRunner.query(`ALTER TABLE "online_stores" ADD COLUMN IF NOT EXISTS "social_linkedin" character varying(200)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "online_stores" DROP COLUMN IF EXISTS "social_x"`)
    await queryRunner.query(`ALTER TABLE "online_stores" DROP COLUMN IF EXISTS "social_linkedin"`)
  }
}
