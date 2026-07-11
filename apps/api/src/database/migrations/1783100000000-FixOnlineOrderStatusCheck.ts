import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * The order status vocabulary expanded (two-axis lifecycle) in
 * ExpandOnlineOrderLifecycle, but the chk_online_orders_status CHECK constraint was
 * left on the OLD set ('DISPATCHED','REFUNDED', …). That silently passed then (no
 * rows to remap) but now rejects any transition to a new status
 * (READY_FOR_DISPATCH, OUT_FOR_DELIVERY, READY_FOR_PICKUP, PICKED_UP,
 * DELIVERY_FAILED, RETURNED). Replace the constraint with the current set.
 */
export class FixOnlineOrderStatusCheck1783100000000 implements MigrationInterface {
  name = 'FixOnlineOrderStatusCheck1783100000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "online_orders" DROP CONSTRAINT IF EXISTS "chk_online_orders_status"`,
    )
    await queryRunner.query(`
      ALTER TABLE "online_orders"
      ADD CONSTRAINT "chk_online_orders_status" CHECK ("status" IN (
        'PENDING','CONFIRMED','PREPARING',
        'READY_FOR_PICKUP','PICKED_UP',
        'READY_FOR_DISPATCH','OUT_FOR_DELIVERY','DELIVERED','DELIVERY_FAILED',
        'RETURNED','CANCELLED'
      ))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "online_orders" DROP CONSTRAINT IF EXISTS "chk_online_orders_status"`,
    )
    await queryRunner.query(`
      ALTER TABLE "online_orders"
      ADD CONSTRAINT "chk_online_orders_status" CHECK ("status" IN (
        'PENDING','CONFIRMED','PREPARING','DISPATCHED','DELIVERED','CANCELLED','REFUNDED'
      ))
    `)
  }
}
