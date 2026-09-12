import { MigrationInterface, QueryRunner } from 'typeorm'
// Relative (not '@/') so it resolves in the compiled dist at runtime — migrations run without the
// path-alias resolver, and no other migration imports app code via '@/'.
import { GEO_SEED } from '../../modules/geo/geo-seed'

/**
 * Spec 10 ③ — global geography reference data (countries → regions → cities), seeded for Cameroon,
 * Nigeria and the UAE. Shared, read-only reference used to populate structured-address selects at
 * checkout and to match delivery zones. More countries are added by extending GEO_SEED + a follow-up
 * migration (idempotent inserts).
 */
export class GeoReference1789500000000 implements MigrationInterface {
  name = 'GeoReference1789500000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "countries" (
        "iso2" character varying(2) NOT NULL,
        "name" character varying(120) NOT NULL,
        CONSTRAINT "pk_countries" PRIMARY KEY ("iso2")
      )
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_countries_name" ON "countries" ("name")`)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "regions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "country_iso2" character varying(2) NOT NULL,
        "name" character varying(120) NOT NULL,
        CONSTRAINT "pk_regions" PRIMARY KEY ("id")
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_regions_country" ON "regions" ("country_iso2")`,
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_regions_country_name" ON "regions" ("country_iso2", "name")`,
    )

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cities" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "country_iso2" character varying(2) NOT NULL,
        "region_name" character varying(120) NOT NULL,
        "name" character varying(160) NOT NULL,
        CONSTRAINT "pk_cities" PRIMARY KEY ("id")
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_cities_country_region" ON "cities" ("country_iso2", "region_name")`,
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_cities_country_region_name" ON "cities" ("country_iso2", "region_name", "name")`,
    )

    for (const country of GEO_SEED) {
      await queryRunner.query(
        `INSERT INTO "countries" ("iso2", "name") VALUES ($1, $2) ON CONFLICT ("iso2") DO NOTHING`,
        [country.iso2, country.name],
      )
      for (const region of country.regions) {
        await queryRunner.query(
          `INSERT INTO "regions" ("country_iso2", "name") VALUES ($1, $2)
           ON CONFLICT ("country_iso2", "name") DO NOTHING`,
          [country.iso2, region.name],
        )
        for (const city of region.cities) {
          await queryRunner.query(
            `INSERT INTO "cities" ("country_iso2", "region_name", "name") VALUES ($1, $2, $3)
             ON CONFLICT ("country_iso2", "region_name", "name") DO NOTHING`,
            [country.iso2, region.name, city],
          )
        }
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "cities"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "regions"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "countries"`)
  }
}
