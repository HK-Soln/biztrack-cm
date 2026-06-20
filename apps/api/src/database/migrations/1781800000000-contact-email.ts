import { MigrationInterface, QueryRunner } from 'typeorm'

/** Store an email address on a contact (supplier document delivery + records). */
export class ContactEmail1781800000000 implements MigrationInterface {
  name = 'ContactEmail1781800000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "email" character varying(200)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "contacts" DROP COLUMN IF EXISTS "email"`)
  }
}
