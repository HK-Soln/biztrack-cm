import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Optional KYC / identification data on a contact (customer or both): document
 * type/number, issue & expiry dates, scanned document files, and a selfie photo.
 * Used for audits and dispute resolution with troublesome clients.
 */
export class ContactKyc1781900000000 implements MigrationInterface {
  name = 'ContactKyc1781900000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "id_type" character varying(30)`)
    await queryRunner.query(`ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "id_number" character varying(100)`)
    await queryRunner.query(`ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "id_issue_date" date`)
    await queryRunner.query(`ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "id_expiry_date" date`)
    await queryRunner.query(`ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "id_documents" jsonb`)
    await queryRunner.query(`ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "selfie_url" character varying(1024)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "contacts" DROP COLUMN IF EXISTS "selfie_url"`)
    await queryRunner.query(`ALTER TABLE "contacts" DROP COLUMN IF EXISTS "id_documents"`)
    await queryRunner.query(`ALTER TABLE "contacts" DROP COLUMN IF EXISTS "id_expiry_date"`)
    await queryRunner.query(`ALTER TABLE "contacts" DROP COLUMN IF EXISTS "id_issue_date"`)
    await queryRunner.query(`ALTER TABLE "contacts" DROP COLUMN IF EXISTS "id_number"`)
    await queryRunner.query(`ALTER TABLE "contacts" DROP COLUMN IF EXISTS "id_type"`)
  }
}
