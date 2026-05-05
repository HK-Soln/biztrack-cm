import { MigrationInterface, QueryRunner } from 'typeorm'

export class DebtsSyncUpdatedAt1777300000000 implements MigrationInterface {
  name = 'DebtsSyncUpdatedAt1777300000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "debts"
      ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    `)

    await queryRunner.query(`
      UPDATE "debts"
      SET "updated_at" = COALESCE("written_off_at", "settled_at", "created_at", now())
      WHERE "updated_at" IS NULL
         OR "updated_at" < COALESCE("written_off_at", "settled_at", "created_at", now())
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_debts_business_id_updated_at"
      ON "debts" ("business_id", "updated_at")
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_debts_business_id_updated_at"
    `)

    await queryRunner.query(`
      ALTER TABLE "debts"
      DROP COLUMN IF EXISTS "updated_at"
    `)
  }
}
