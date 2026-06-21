import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Grant the online storefront to existing plan_configs rows. ONLINE_STORE was added to the
 * in-code DEFAULT_PLAN_RESOURCES, but getEffectivePermissions reads the DB plan_configs
 * (cached in Redis) — so seeded rows need this update. Store = BUSINESS + PRO; the builder +
 * custom domains are PRO-only (issue #91).
 *
 * NOTE: clear the Redis `permissions:*` cache (or wait for its TTL) after running so businesses
 * pick up the new entitlement immediately.
 */
export class AddOnlineStoreToPlans1782300000000 implements MigrationInterface {
  name = 'AddOnlineStoreToPlans1782300000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    const add = (plan: string, resource: string) =>
      queryRunner.query(
        `UPDATE "plan_configs" SET "resources" = array_append("resources", '${resource}')
         WHERE "plan" = '${plan}' AND NOT ('${resource}' = ANY("resources"))`,
      )
    await add('BUSINESS', 'ONLINE_STORE')
    await add('PRO', 'ONLINE_STORE')
    await add('PRO', 'ONLINE_STORE_BUILDER')
    await add('PRO', 'ONLINE_STORE_CUSTOM_DOMAIN')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const remove = (plan: string, resource: string) =>
      queryRunner.query(`UPDATE "plan_configs" SET "resources" = array_remove("resources", '${resource}') WHERE "plan" = '${plan}'`)
    await remove('BUSINESS', 'ONLINE_STORE')
    await remove('PRO', 'ONLINE_STORE')
    await remove('PRO', 'ONLINE_STORE_BUILDER')
    await remove('PRO', 'ONLINE_STORE_CUSTOM_DOMAIN')
  }
}
