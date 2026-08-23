import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Business timezone for notifications (P1). The server is region-agnostic, so quiet
 * hours and scheduled digests must be evaluated in the business's own timezone.
 */
export class NotificationSettingsTimezone1786200000000 implements MigrationInterface {
  name = 'NotificationSettingsTimezone1786200000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notification_settings" ADD COLUMN IF NOT EXISTS "timezone" varchar(64) NOT NULL DEFAULT 'Africa/Douala'`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notification_settings" DROP COLUMN IF EXISTS "timezone"`)
  }
}
