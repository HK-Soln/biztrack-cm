import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Receive-from-PO settlement: supplier discount lines, additional charge lines
 * (tax/transport/packaging), and a supplier invoice (number + date + file) on a goods
 * receipt. Mirrors the sale charge/discount tables. Split payments reuse restock_payments.
 */
export class RestockSettlement1781700000000 implements MigrationInterface {
  name = 'RestockSettlement1781700000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "restock_records" ADD COLUMN IF NOT EXISTS "discount_amount" numeric(12,2) NOT NULL DEFAULT 0`)
    await queryRunner.query(`ALTER TABLE "restock_records" ADD COLUMN IF NOT EXISTS "charges_amount" numeric(12,2) NOT NULL DEFAULT 0`)
    await queryRunner.query(`ALTER TABLE "restock_records" ADD COLUMN IF NOT EXISTS "invoice_number" character varying(100)`)
    await queryRunner.query(`ALTER TABLE "restock_records" ADD COLUMN IF NOT EXISTS "invoice_date" date`)
    await queryRunner.query(`ALTER TABLE "restock_records" ADD COLUMN IF NOT EXISTS "invoice_file_url" character varying(1024)`)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "restock_charges" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "restock_record_id" uuid NOT NULL,
        "business_id" uuid NOT NULL,
        "charge_type_id" uuid,
        "name" character varying(200) NOT NULL,
        "rate_type" character varying(20) NOT NULL DEFAULT 'FIXED',
        "rate_value" numeric(10,4) NOT NULL DEFAULT 0,
        "amount" numeric(12,2) NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_restock_charges" PRIMARY KEY ("id"),
        CONSTRAINT "fk_restock_charges_record" FOREIGN KEY ("restock_record_id")
          REFERENCES "restock_records"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_restock_charges_business" FOREIGN KEY ("business_id")
          REFERENCES "businesses"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_restock_charges_charge_type" FOREIGN KEY ("charge_type_id")
          REFERENCES "charge_types"("id") ON DELETE SET NULL
      )
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_restock_charges_record" ON "restock_charges" ("restock_record_id")`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_restock_charges_business" ON "restock_charges" ("business_id")`)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "restock_discounts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "restock_record_id" uuid NOT NULL,
        "business_id" uuid NOT NULL,
        "description" character varying(200) NOT NULL DEFAULT '',
        "discount_type" character varying(20) NOT NULL DEFAULT 'FIXED_AMOUNT',
        "rate" numeric(8,4),
        "amount" numeric(12,2) NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_restock_discounts" PRIMARY KEY ("id"),
        CONSTRAINT "fk_restock_discounts_record" FOREIGN KEY ("restock_record_id")
          REFERENCES "restock_records"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_restock_discounts_business" FOREIGN KEY ("business_id")
          REFERENCES "businesses"("id") ON DELETE CASCADE
      )
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_restock_discounts_record" ON "restock_discounts" ("restock_record_id")`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_restock_discounts_business" ON "restock_discounts" ("business_id")`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "restock_discounts"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "restock_charges"`)
    await queryRunner.query(`ALTER TABLE "restock_records" DROP COLUMN IF EXISTS "invoice_file_url"`)
    await queryRunner.query(`ALTER TABLE "restock_records" DROP COLUMN IF EXISTS "invoice_date"`)
    await queryRunner.query(`ALTER TABLE "restock_records" DROP COLUMN IF EXISTS "invoice_number"`)
    await queryRunner.query(`ALTER TABLE "restock_records" DROP COLUMN IF EXISTS "charges_amount"`)
    await queryRunner.query(`ALTER TABLE "restock_records" DROP COLUMN IF EXISTS "discount_amount"`)
  }
}
