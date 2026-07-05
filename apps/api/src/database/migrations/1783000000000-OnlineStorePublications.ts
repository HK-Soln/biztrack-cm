import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Immutable, versioned publish snapshots for online stores. The public storefront reads the
 * latest snapshot for a store; the `online_stores` row becomes the editable draft. Enables
 * staged config, an audit trail, and rollback.
 */
export class OnlineStorePublications1783000000000 implements MigrationInterface {
  name = 'OnlineStorePublications1783000000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "online_store_publications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "business_id" uuid NOT NULL,
        "online_store_id" uuid NOT NULL,
        "version" integer NOT NULL,
        "config" jsonb NOT NULL,
        "published_by_id" uuid,
        "published_by_name" character varying(200),
        "source_version" integer,
        CONSTRAINT "pk_online_store_publications" PRIMARY KEY ("id"),
        CONSTRAINT "unq_online_store_publications_store_version" UNIQUE ("online_store_id", "version"),
        CONSTRAINT "fk_online_store_publications_store_id" FOREIGN KEY ("online_store_id")
          REFERENCES "online_stores"("id") ON DELETE CASCADE
      )
    `)
    await queryRunner.query(
      `CREATE INDEX "idx_online_store_publications_store" ON "online_store_publications" ("online_store_id")`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_online_store_publications_store"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "online_store_publications"`)
  }
}
