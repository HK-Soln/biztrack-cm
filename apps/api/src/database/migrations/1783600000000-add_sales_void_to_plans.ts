import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Grant SALES_VOID to existing plan_configs rows. The resource existed in the Resource enum
 * but was never added to any plan's resource list, so the ResourceGuard denied voiding a sale
 * on every plan — surfacing a misleading "requires PRO plan" (the getMinimumPlanFor fallback).
 *
 * Void is a core POS correction (already role-gated to OWNER/MANAGER), so it's granted on every
 * plan — matching SALES_CREATE / SALES_VIEW in the in-code DEFAULT_PLAN_RESOURCES (FREE base).
 * getEffectivePermissions reads the DB plan_configs (cached in Redis), so seeded rows need this.
 *
 * NOTE: clear the Redis `permissions:*` cache (or wait out its 5-min TTL) after running so
 * businesses pick up the entitlement immediately.
 */
export class AddSalesVoidToPlans1783600000000 implements MigrationInterface {
  name = 'AddSalesVoidToPlans1783600000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "plan_configs" SET "resources" = array_append("resources", 'SALES_VOID')
       WHERE NOT ('SALES_VOID' = ANY("resources"))`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "plan_configs" SET "resources" = array_remove("resources", 'SALES_VOID')`,
    )
  }
}
