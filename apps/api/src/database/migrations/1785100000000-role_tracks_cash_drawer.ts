import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Per-role cash-drawer flag (BIZ-2.4 UI). `tracks_cash_drawer` marks a role whose members
 * run a till — they get prompted to open a shift at login and see the shift control in the
 * nav. Cashiers track a drawer by default; the owner can enable it for any role. Rides the
 * existing roles sync to devices.
 */
export class RoleTracksCashDrawer1785100000000 implements MigrationInterface {
  name = 'RoleTracksCashDrawer1785100000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "tracks_cash_drawer" boolean NOT NULL DEFAULT false`,
    )
    // Bump updated_at so offline devices re-pull the flag (LWW skips unchanged rows).
    await queryRunner.query(
      `UPDATE "roles" SET "tracks_cash_drawer" = true, "updated_at" = now()
       WHERE "is_system" = true AND "name" = 'CASHIER'`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "roles" DROP COLUMN IF EXISTS "tracks_cash_drawer"`)
  }
}
