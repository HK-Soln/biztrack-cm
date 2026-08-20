import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Daily-digest send offset (P2). The owner's daily summary is sent relative to the
 * business's closing time (per-weekday business hours); this column holds how many
 * minutes after close to send it (0–180, clamped in the service).
 */
export class NotificationDailyDigestOffset1786600000000 implements MigrationInterface {
  name = 'NotificationDailyDigestOffset1786600000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notification_settings" ADD COLUMN IF NOT EXISTS "daily_digest_offset_minutes" integer NOT NULL DEFAULT 30`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notification_settings" DROP COLUMN IF EXISTS "daily_digest_offset_minutes"`,
    )
  }
}
