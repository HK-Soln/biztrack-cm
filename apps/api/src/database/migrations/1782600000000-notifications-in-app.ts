import { MigrationInterface, QueryRunner } from 'typeorm'

/** Extend notifications for the in-app feed: a new IN_APP channel value, a deeplink
 * (internal route the bell/banner opens) and a read_at timestamp for unread tracking,
 * plus a partial index on user_id for the per-user feed query. */
export class NotificationsInApp1782600000000 implements MigrationInterface {
  name = 'NotificationsInApp1782600000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "notification_channel_enum" ADD VALUE IF NOT EXISTS 'in_app'`,
    )
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "deeplink" character varying(500)`,
    )
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "read_at" TIMESTAMP WITH TIME ZONE`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_notifications_user_id" ON "notifications" ("user_id") WHERE "user_id" IS NOT NULL`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_notifications_user_id"`)
    await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN IF EXISTS "read_at"`)
    await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN IF EXISTS "deeplink"`)
    // Postgres can't drop a single enum value without recreating the type; left as-is.
  }
}
