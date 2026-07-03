import { MigrationInterface, QueryRunner } from 'typeorm'

/** Add a SUSPENDED value to the business-member status enum so a member's access can
 * be revoked (and later reactivated) without removing them. */
export class MemberSuspended1782500000000 implements MigrationInterface {
  name = 'MemberSuspended1782500000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."business_members_status_enum" ADD VALUE IF NOT EXISTS 'SUSPENDED'`,
    )
  }

  public async down(): Promise<void> {
    // Postgres can't drop a single enum value without recreating the type; left as a no-op.
  }
}
