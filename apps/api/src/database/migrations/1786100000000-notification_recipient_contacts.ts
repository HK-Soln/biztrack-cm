import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Recipient model v2 (P0.6). A notification recipient carries separate SMS and
 * WhatsApp contacts (they may be different numbers) instead of a single `phone`.
 * Recipients are owner-curated destinations, optionally linked to a platform user.
 */
export class NotificationRecipientContacts1786100000000 implements MigrationInterface {
  name = 'NotificationRecipientContacts1786100000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notification_recipients" ADD COLUMN IF NOT EXISTS "sms_contact" varchar(40)`,
    )
    await queryRunner.query(
      `ALTER TABLE "notification_recipients" ADD COLUMN IF NOT EXISTS "whatsapp_contact" varchar(40)`,
    )
    // Carry any existing single phone into both channels, then drop it.
    await queryRunner.query(
      `UPDATE "notification_recipients"
         SET "sms_contact" = COALESCE("sms_contact", "phone"),
             "whatsapp_contact" = COALESCE("whatsapp_contact", "phone")
       WHERE "phone" IS NOT NULL`,
    )
    await queryRunner.query(`ALTER TABLE "notification_recipients" DROP COLUMN IF EXISTS "phone"`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notification_recipients" ADD COLUMN IF NOT EXISTS "phone" varchar(40)`,
    )
    await queryRunner.query(
      `UPDATE "notification_recipients" SET "phone" = COALESCE("whatsapp_contact", "sms_contact")`,
    )
    await queryRunner.query(
      `ALTER TABLE "notification_recipients" DROP COLUMN IF EXISTS "whatsapp_contact"`,
    )
    await queryRunner.query(
      `ALTER TABLE "notification_recipients" DROP COLUMN IF EXISTS "sms_contact"`,
    )
  }
}
