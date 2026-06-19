import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Requests for Quotation (RFQs): the procurement inquiry step. An RFQ has line items
 * (products/variants) and a set of suppliers it's sent to, each of which can return a
 * quote. A chosen quote later converts to a Purchase Order.
 */
export class Rfqs1781300000000 implements MigrationInterface {
  name = 'Rfqs1781300000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "rfqs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "business_id" uuid NOT NULL,
        "number" character varying NOT NULL,
        "title" character varying,
        "message_body" text,
        "status" character varying NOT NULL DEFAULT 'DRAFT',
        "currency" character varying NOT NULL DEFAULT 'XAF',
        "created_by_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_rfqs_id" PRIMARY KEY ("id")
      )
    `)
    await queryRunner.query(`
      ALTER TABLE "rfqs" ADD CONSTRAINT "fk_rfqs_business_id"
      FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_rfqs_business_id_deleted_at" ON "rfqs" ("business_id", "deleted_at")`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_rfqs_business_id_status" ON "rfqs" ("business_id", "status")`)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "rfq_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "rfq_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "variant_id" uuid,
        "description" character varying NOT NULL,
        "quantity" numeric(14,2) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_rfq_items_id" PRIMARY KEY ("id")
      )
    `)
    await queryRunner.query(`
      ALTER TABLE "rfq_items" ADD CONSTRAINT "fk_rfq_items_rfq_id"
      FOREIGN KEY ("rfq_id") REFERENCES "rfqs"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_rfq_items_rfq_id" ON "rfq_items" ("rfq_id")`)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "rfq_suppliers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "rfq_id" uuid NOT NULL,
        "supplier_id" uuid NOT NULL,
        "supplier_name" character varying,
        "status" character varying NOT NULL DEFAULT 'PENDING',
        "quoted_total" numeric(14,2),
        "quote_notes" text,
        "responded_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_rfq_suppliers_id" PRIMARY KEY ("id")
      )
    `)
    await queryRunner.query(`
      ALTER TABLE "rfq_suppliers" ADD CONSTRAINT "fk_rfq_suppliers_rfq_id"
      FOREIGN KEY ("rfq_id") REFERENCES "rfqs"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_rfq_suppliers_rfq_id" ON "rfq_suppliers" ("rfq_id")`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "rfq_suppliers"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "rfq_items"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "rfqs"`)
  }
}
