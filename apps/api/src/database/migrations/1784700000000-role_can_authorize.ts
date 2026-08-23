import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Per-role authorization capability. `can_authorize` marks a role whose members may
 * set a manager PIN and approve till actions (discounts, overrides, over-limit) via
 * step-up. Replaces the hard-coded OWNER/MANAGER check, so a custom role (e.g.
 * Supervisor) can be granted approval power. Rides the existing roles sync to devices.
 *
 * Existing system OWNER/MANAGER roles are backfilled to true to preserve behaviour.
 */
export class RoleCanAuthorize1784700000000 implements MigrationInterface {
  name = 'RoleCanAuthorize1784700000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "can_authorize" boolean NOT NULL DEFAULT false`,
    )
    await queryRunner.query(
      `UPDATE "roles" SET "can_authorize" = true WHERE "is_system" = true AND "name" IN ('OWNER', 'MANAGER')`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "roles" DROP COLUMN IF EXISTS "can_authorize"`)
  }
}
