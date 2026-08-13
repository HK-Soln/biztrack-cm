import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Offline manager-PIN credential (BIZ-3.1). Adds the PIN hash + version + set
 * timestamp to each business membership. The hash is computed on the device with
 * bcrypt; the server only stores it so it can be distributed (pulled) to a
 * cashier's device for offline manager step-up. The server never verifies it.
 */
export class BusinessMemberPin1784400000000 implements MigrationInterface {
  name = 'BusinessMemberPin1784400000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "business_members" ADD COLUMN IF NOT EXISTS "pin_hash" text`,
    )
    await queryRunner.query(
      `ALTER TABLE "business_members" ADD COLUMN IF NOT EXISTS "pin_version" integer NOT NULL DEFAULT 0`,
    )
    await queryRunner.query(
      `ALTER TABLE "business_members" ADD COLUMN IF NOT EXISTS "pin_set_at" timestamptz`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "business_members" DROP COLUMN IF EXISTS "pin_set_at"`)
    await queryRunner.query(`ALTER TABLE "business_members" DROP COLUMN IF EXISTS "pin_version"`)
    await queryRunner.query(`ALTER TABLE "business_members" DROP COLUMN IF EXISTS "pin_hash"`)
  }
}
