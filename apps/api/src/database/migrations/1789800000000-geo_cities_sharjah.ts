import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Spec 10 ③ follow-up — add more Sharjah (AE) cities to the geography reference. The original
 * geo seed (1789500000000) already ran, so extending GEO_SEED needs an idempotent follow-up insert.
 * Idempotent via the unique (country_iso2, region_name, name) index — safe to re-run and a no-op
 * where a city already exists. `down` removes only the rows this migration added.
 */
export class GeoCitiesSharjah1789800000000 implements MigrationInterface {
  name = 'GeoCitiesSharjah1789800000000'

  private static readonly CITIES = ['Al Khan', 'Al Nahda', 'Muweillah']

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const city of GeoCitiesSharjah1789800000000.CITIES) {
      await queryRunner.query(
        `INSERT INTO "cities" ("country_iso2", "region_name", "name")
         VALUES ($1, $2, $3)
         ON CONFLICT ("country_iso2", "region_name", "name") DO NOTHING`,
        ['AE', 'Sharjah', city],
      )
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "cities"
       WHERE "country_iso2" = $1 AND "region_name" = $2 AND "name" = ANY($3::varchar[])`,
      ['AE', 'Sharjah', GeoCitiesSharjah1789800000000.CITIES],
    )
  }
}
