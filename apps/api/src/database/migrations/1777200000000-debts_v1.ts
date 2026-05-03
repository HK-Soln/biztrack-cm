import { MigrationInterface, QueryRunner } from 'typeorm'

const NEW_RESOURCES = [
  'CONTACTS_VIEW',
  'CONTACTS_MANAGE',
  'DEBTS_VIEW',
  'DEBTS_RECORD_PAYMENT',
  'DEBTS_DELETE_PAYMENT',
  'DEBTS_WRITE_OFF',
] as const

export class DebtsV11777200000000 implements MigrationInterface {
  name = 'DebtsV11777200000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "contacts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "business_id" uuid NOT NULL,
        "type" character varying NOT NULL,
        "name" character varying(200) NOT NULL,
        "phone" character varying(30),
        "phone_alt" character varying(30),
        "address" text,
        "notes" text,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_by" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_contacts_id" PRIMARY KEY ("id")
      )
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_contacts_business_id_type"
      ON "contacts" ("business_id", "type")
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_contacts_business_id_is_active"
      ON "contacts" ("business_id", "is_active")
    `)

    await queryRunner.query(`
      ALTER TABLE "contacts"
      ADD CONSTRAINT "fk_contacts_business_id"
      FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `).catch(() => undefined)

    await queryRunner.query(`
      ALTER TABLE "contacts"
      ADD CONSTRAINT "fk_contacts_created_by"
      FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `).catch(() => undefined)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "debts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "business_id" uuid NOT NULL,
        "contact_id" uuid NOT NULL,
        "direction" character varying NOT NULL,
        "source_type" character varying NOT NULL,
        "source_id" uuid NOT NULL,
        "source_reference" character varying(30) NOT NULL,
        "original_amount" numeric(12,2) NOT NULL,
        "status" character varying NOT NULL DEFAULT 'OUTSTANDING',
        "due_date" date,
        "notes" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "settled_at" TIMESTAMP WITH TIME ZONE,
        "written_off_at" TIMESTAMP WITH TIME ZONE,
        "written_off_by" uuid,
        "written_off_reason" text,
        CONSTRAINT "PK_debts_id" PRIMARY KEY ("id")
      )
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_debts_business_id_status"
      ON "debts" ("business_id", "status")
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_debts_business_id_direction"
      ON "debts" ("business_id", "direction")
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_debts_business_id_contact_id"
      ON "debts" ("business_id", "contact_id")
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_debts_source_type_source_id"
      ON "debts" ("source_type", "source_id")
    `)

    await queryRunner.query(`
      ALTER TABLE "debts"
      ADD CONSTRAINT "fk_debts_business_id"
      FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `).catch(() => undefined)

    await queryRunner.query(`
      ALTER TABLE "debts"
      ADD CONSTRAINT "fk_debts_contact_id"
      FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `).catch(() => undefined)

    await queryRunner.query(`
      ALTER TABLE "debts"
      ADD CONSTRAINT "fk_debts_written_off_by"
      FOREIGN KEY ("written_off_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `).catch(() => undefined)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "debt_payments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "business_id" uuid NOT NULL,
        "debt_id" uuid NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "method" character varying NOT NULL,
        "mobile_money_reference" character varying(100),
        "payment_date" date NOT NULL,
        "notes" text,
        "recorded_by" uuid NOT NULL,
        CONSTRAINT "PK_debt_payments_id" PRIMARY KEY ("id")
      )
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_debt_payments_business_id"
      ON "debt_payments" ("business_id")
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_debt_payments_debt_id"
      ON "debt_payments" ("debt_id")
    `)

    await queryRunner.query(`
      ALTER TABLE "debt_payments"
      ADD CONSTRAINT "fk_debt_payments_business_id"
      FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `).catch(() => undefined)

    await queryRunner.query(`
      ALTER TABLE "debt_payments"
      ADD CONSTRAINT "fk_debt_payments_debt_id"
      FOREIGN KEY ("debt_id") REFERENCES "debts"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `).catch(() => undefined)

    await queryRunner.query(`
      ALTER TABLE "debt_payments"
      ADD CONSTRAINT "fk_debt_payments_recorded_by"
      FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `).catch(() => undefined)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "restock_payments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "restock_record_id" uuid NOT NULL,
        "business_id" uuid NOT NULL,
        "method" character varying NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "mobile_money_reference" character varying(100),
        CONSTRAINT "PK_restock_payments_id" PRIMARY KEY ("id")
      )
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_restock_payments_restock_record_id"
      ON "restock_payments" ("restock_record_id")
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_restock_payments_business_id"
      ON "restock_payments" ("business_id")
    `)

    await queryRunner.query(`
      ALTER TABLE "restock_payments"
      ADD CONSTRAINT "fk_restock_payments_restock_record_id"
      FOREIGN KEY ("restock_record_id") REFERENCES "restock_records"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `).catch(() => undefined)

    await queryRunner.query(`
      ALTER TABLE "restock_payments"
      ADD CONSTRAINT "fk_restock_payments_business_id"
      FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `).catch(() => undefined)

    await queryRunner.query(`
      ALTER TABLE "sales"
      ADD COLUMN IF NOT EXISTS "credit_amount" numeric(12,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "customer_id" uuid
    `)

    await queryRunner.query(`
      ALTER TABLE "sales"
      ADD CONSTRAINT "fk_sales_customer_id"
      FOREIGN KEY ("customer_id") REFERENCES "contacts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `).catch(() => undefined)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_sales_business_id_customer_id"
      ON "sales" ("business_id", "customer_id")
    `)

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'sales'
            AND column_name = 'has_credit'
        ) THEN
          ALTER TABLE "sales"
          ADD COLUMN "has_credit" boolean GENERATED ALWAYS AS ("credit_amount" > 0) STORED;
        END IF;
      END$$;
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_sales_business_id_has_credit"
      ON "sales" ("business_id", "has_credit")
    `)

    await queryRunner.query(`
      ALTER TABLE "restock_records"
      ADD COLUMN IF NOT EXISTS "total_amount" numeric(12,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "amount_paid" numeric(12,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "credit_amount" numeric(12,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "supplier_id" uuid
    `)

    await queryRunner.query(`
      UPDATE "restock_records"
      SET "total_amount" = COALESCE("total_amount", COALESCE("total_cost", 0)),
          "amount_paid" = CASE
            WHEN "amount_paid" IS NULL OR "amount_paid" = 0 THEN COALESCE("total_cost", 0)
            ELSE "amount_paid"
          END,
          "credit_amount" = COALESCE("credit_amount", 0)
    `)

    await queryRunner.query(`
      ALTER TABLE "restock_records"
      ADD CONSTRAINT "fk_restock_records_supplier_id"
      FOREIGN KEY ("supplier_id") REFERENCES "contacts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `).catch(() => undefined)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_restock_records_business_id_supplier_id"
      ON "restock_records" ("business_id", "supplier_id")
    `)

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'restock_records'
            AND column_name = 'has_credit'
        ) THEN
          ALTER TABLE "restock_records"
          ADD COLUMN "has_credit" boolean GENERATED ALWAYS AS ("credit_amount" > 0) STORED;
        END IF;
      END$$;
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_restock_records_business_id_has_credit"
      ON "restock_records" ("business_id", "has_credit")
    `)

    await queryRunner.query(`
      ALTER TABLE "daily_sale_summaries"
      ADD COLUMN IF NOT EXISTS "credit_issued" numeric(12,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "credit_sales" integer NOT NULL DEFAULT 0
    `)

    const resourcesSql = NEW_RESOURCES.map((resource) => `'${resource}'`).join(', ')
    await queryRunner.query(`
      UPDATE "plan_configs"
      SET "resources" = ARRAY(
        SELECT DISTINCT resource
        FROM unnest(COALESCE("resources", ARRAY[]::text[]) || ARRAY[${resourcesSql}]) AS resource
      )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const resource of NEW_RESOURCES) {
      await queryRunner.query(`
        UPDATE "plan_configs"
        SET "resources" = array_remove(COALESCE("resources", ARRAY[]::text[]), '${resource}')
      `)
    }

    await queryRunner.query(`DROP INDEX IF EXISTS "idx_restock_records_business_id_has_credit"`)
    await queryRunner.query(`ALTER TABLE "restock_records" DROP CONSTRAINT IF EXISTS "fk_restock_records_supplier_id"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_restock_records_business_id_supplier_id"`)
    await queryRunner.query(`
      ALTER TABLE "restock_records"
      DROP COLUMN IF EXISTS "has_credit",
      DROP COLUMN IF EXISTS "supplier_id",
      DROP COLUMN IF EXISTS "credit_amount",
      DROP COLUMN IF EXISTS "amount_paid",
      DROP COLUMN IF EXISTS "total_amount"
    `)

    await queryRunner.query(`DROP INDEX IF EXISTS "idx_sales_business_id_has_credit"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_sales_business_id_customer_id"`)
    await queryRunner.query(`ALTER TABLE "sales" DROP CONSTRAINT IF EXISTS "fk_sales_customer_id"`)
    await queryRunner.query(`
      ALTER TABLE "sales"
      DROP COLUMN IF EXISTS "has_credit",
      DROP COLUMN IF EXISTS "customer_id",
      DROP COLUMN IF EXISTS "credit_amount"
    `)

    await queryRunner.query(`
      ALTER TABLE "daily_sale_summaries"
      DROP COLUMN IF EXISTS "credit_sales",
      DROP COLUMN IF EXISTS "credit_issued"
    `)

    await queryRunner.query(`ALTER TABLE "restock_payments" DROP CONSTRAINT IF EXISTS "fk_restock_payments_business_id"`)
    await queryRunner.query(`ALTER TABLE "restock_payments" DROP CONSTRAINT IF EXISTS "fk_restock_payments_restock_record_id"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_restock_payments_business_id"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_restock_payments_restock_record_id"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "restock_payments"`)

    await queryRunner.query(`ALTER TABLE "debt_payments" DROP CONSTRAINT IF EXISTS "fk_debt_payments_recorded_by"`)
    await queryRunner.query(`ALTER TABLE "debt_payments" DROP CONSTRAINT IF EXISTS "fk_debt_payments_debt_id"`)
    await queryRunner.query(`ALTER TABLE "debt_payments" DROP CONSTRAINT IF EXISTS "fk_debt_payments_business_id"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_debt_payments_debt_id"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_debt_payments_business_id"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "debt_payments"`)

    await queryRunner.query(`ALTER TABLE "debts" DROP CONSTRAINT IF EXISTS "fk_debts_written_off_by"`)
    await queryRunner.query(`ALTER TABLE "debts" DROP CONSTRAINT IF EXISTS "fk_debts_contact_id"`)
    await queryRunner.query(`ALTER TABLE "debts" DROP CONSTRAINT IF EXISTS "fk_debts_business_id"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_debts_source_type_source_id"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_debts_business_id_contact_id"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_debts_business_id_direction"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_debts_business_id_status"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "debts"`)

    await queryRunner.query(`ALTER TABLE "contacts" DROP CONSTRAINT IF EXISTS "fk_contacts_created_by"`)
    await queryRunner.query(`ALTER TABLE "contacts" DROP CONSTRAINT IF EXISTS "fk_contacts_business_id"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_contacts_business_id_is_active"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_contacts_business_id_type"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "contacts"`)
  }
}
