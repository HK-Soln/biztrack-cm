import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Add RESET_PASSWORD to the verification_codes purpose enum so forgot-password OTPs can be issued
 * and verified alongside the existing REGISTER/LOGIN/VERIFY_* purposes. Postgres has no DROP VALUE,
 * so `down` is a no-op (the value is harmless if unused).
 */
export class AddResetPasswordVerificationPurpose1783500000000 implements MigrationInterface {
  name = 'AddResetPasswordVerificationPurpose1783500000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."verification_codes_purpose_enum" ADD VALUE IF NOT EXISTS 'RESET_PASSWORD'`,
    )
  }

  public async down(): Promise<void> {
    // Postgres enums can't drop a value; leaving RESET_PASSWORD in place is safe.
  }
}
