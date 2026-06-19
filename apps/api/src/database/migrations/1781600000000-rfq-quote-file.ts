import { MigrationInterface, QueryRunner } from 'typeorm'

/** Store the supplier's uploaded quotation document (PDF) URL on the RFQ supplier. */
export class RfqQuoteFile1781600000000 implements MigrationInterface {
  name = 'RfqQuoteFile1781600000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "rfq_suppliers" ADD COLUMN IF NOT EXISTS "quote_file_url" character varying`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "rfq_suppliers" DROP COLUMN IF EXISTS "quote_file_url"`)
  }
}
