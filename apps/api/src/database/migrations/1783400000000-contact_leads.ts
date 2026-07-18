import { MigrationInterface, QueryRunner } from 'typeorm'

export class ContactLeads1783400000000 implements MigrationInterface {
  name = 'ContactLeads1783400000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$ BEGIN
        CREATE TYPE "contact_lead_status_enum" AS ENUM ('NEW', 'CONTACTED', 'CLOSED');
      EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    )
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "contact_leads" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "name" character varying(200) NOT NULL,
      "business" character varying(200),
      "phone" character varying(50) NOT NULL,
      "email" character varying(300),
      "city" character varying(120),
      "topic" character varying(120),
      "message" text NOT NULL,
      "consent" boolean NOT NULL DEFAULT false,
      "locale" character varying(5) NOT NULL DEFAULT 'fr',
      "user_agent" character varying(500),
      "status" "contact_lead_status_enum" NOT NULL DEFAULT 'NEW',
      "notes" text,
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_contact_leads_id" PRIMARY KEY ("id")
    )`)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_contact_leads_email" ON "contact_leads" ("email")`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_contact_leads_status" ON "contact_leads" ("status")`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_contact_leads_created_at" ON "contact_leads" ("created_at" DESC)`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_contact_leads_created_at"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_contact_leads_status"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_contact_leads_email"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "contact_leads"`)
    await queryRunner.query(`DROP TYPE IF EXISTS "contact_lead_status_enum"`)
  }
}
