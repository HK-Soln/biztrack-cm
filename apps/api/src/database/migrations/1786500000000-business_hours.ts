import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Per-weekday business hours on the business (BIZ-4.2). `{ mon: {open,close}|null, … }`
 * evaluated in the business timezone; drives the daily owner-digest send time.
 */
export class BusinessHours1786500000000 implements MigrationInterface {
  name = 'BusinessHours1786500000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "business_hours" jsonb`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "businesses" DROP COLUMN IF EXISTS "business_hours"`)
  }
}
