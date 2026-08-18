import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Notifications control plane (P0 foundation). Adds the 7 configurable event types
 * to `notification_type_enum` and creates the per-business preferences store:
 *  - `notification_settings`   — one row per business: channel×event matrix (jsonb) + quiet hours.
 *  - `notification_recipients` — who receives notifications + which events (subscriptions jsonb).
 *
 * See docs/design/notifications-initiative-plan.md.
 */
export class NotificationsControlPlane1786000000000 implements MigrationInterface {
  name = 'NotificationsControlPlane1786000000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) Extend the notification type enum with the 7 configurable events. ADD VALUE
    //    only registers the labels (they are not used in this transaction), which is
    //    safe inside a migration transaction on PostgreSQL 12+.
    for (const value of [
      'low_stock',
      'new_order',
      'payment_received',
      'debt_due',
      'daily_summary',
      'team_activity',
      'billing',
    ]) {
      await queryRunner.query(
        `ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS '${value}'`,
      )
    }

    // 2) Per-business settings (matrix + quiet hours).
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notification_settings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "business_id" uuid NOT NULL,
        "matrix" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "quiet_hours_enabled" boolean NOT NULL DEFAULT false,
        "quiet_from" varchar(5) NOT NULL DEFAULT '21:00',
        "quiet_until" varchar(5) NOT NULL DEFAULT '07:00',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "pk_notification_settings" PRIMARY KEY ("id"),
        CONSTRAINT "fk_notification_settings_business_id" FOREIGN KEY ("business_id")
          REFERENCES "businesses" ("id") ON DELETE CASCADE
      )
    `)
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "unq_notification_settings_business_id"
       ON "notification_settings" ("business_id")`,
    )

    // 3) Recipients + per-recipient event subscriptions.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notification_recipients" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "business_id" uuid NOT NULL,
        "user_id" uuid,
        "name" varchar(200),
        "email" varchar(320),
        "phone" varchar(40),
        "subscriptions" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "pk_notification_recipients" PRIMARY KEY ("id"),
        CONSTRAINT "fk_notification_recipients_business_id" FOREIGN KEY ("business_id")
          REFERENCES "businesses" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_notification_recipients_user_id" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_notification_recipients_business_id"
       ON "notification_recipients" ("business_id")`,
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "unq_notification_recipients_business_user"
       ON "notification_recipients" ("business_id", "user_id") WHERE "user_id" IS NOT NULL`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_recipients"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_settings"`)
    // PostgreSQL cannot remove enum values; the 7 added labels are left in place.
  }
}
