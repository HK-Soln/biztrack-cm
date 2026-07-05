import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Expand the online-order lifecycle: pickup + delivery fulfilment branches, a
 * delivery-service (courier) seam, and richer lifecycle timestamps. Refunds move from
 * the fulfilment status onto the payment axis. `status`/`payment_status` are varchars
 * (not DB enums), so only the data is remapped — no type change.
 */
export class ExpandOnlineOrderLifecycle1782800000000 implements MigrationInterface {
  name = 'ExpandOnlineOrderLifecycle1782800000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // DISPATCHED was delivery-only; renamed to OUT_FOR_DELIVERY.
    await queryRunner.query(
      `ALTER TABLE "online_orders" RENAME COLUMN "dispatched_at" TO "out_for_delivery_at"`,
    )
    // New lifecycle timestamps.
    await queryRunner.query(`ALTER TABLE "online_orders" ADD "ready_at" TIMESTAMP`)
    await queryRunner.query(`ALTER TABLE "online_orders" ADD "picked_up_at" TIMESTAMP`)
    await queryRunner.query(`ALTER TABLE "online_orders" ADD "returned_at" TIMESTAMP`)
    // Delivery-service (courier) integration seam.
    await queryRunner.query(`ALTER TABLE "online_orders" ADD "courier_name" character varying(120)`)
    await queryRunner.query(
      `ALTER TABLE "online_orders" ADD "courier_tracking_number" character varying(120)`,
    )
    await queryRunner.query(`ALTER TABLE "online_orders" ADD "courier_tracking_url" text`)

    // Remap existing rows to the new vocabulary.
    await queryRunner.query(
      `UPDATE "online_orders" SET "status" = 'OUT_FOR_DELIVERY' WHERE "status" = 'DISPATCHED'`,
    )
    // Legacy REFUNDED: fulfilment becomes RETURNED; the refund lives on the payment axis.
    await queryRunner.query(
      `UPDATE "online_orders" SET "payment_status" = 'REFUNDED', "status" = 'RETURNED' WHERE "status" = 'REFUNDED'`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "online_orders" SET "status" = 'DISPATCHED' WHERE "status" = 'OUT_FOR_DELIVERY'`,
    )
    await queryRunner.query(`ALTER TABLE "online_orders" DROP COLUMN "courier_tracking_url"`)
    await queryRunner.query(`ALTER TABLE "online_orders" DROP COLUMN "courier_tracking_number"`)
    await queryRunner.query(`ALTER TABLE "online_orders" DROP COLUMN "courier_name"`)
    await queryRunner.query(`ALTER TABLE "online_orders" DROP COLUMN "returned_at"`)
    await queryRunner.query(`ALTER TABLE "online_orders" DROP COLUMN "picked_up_at"`)
    await queryRunner.query(`ALTER TABLE "online_orders" DROP COLUMN "ready_at"`)
    await queryRunner.query(
      `ALTER TABLE "online_orders" RENAME COLUMN "out_for_delivery_at" TO "dispatched_at"`,
    )
  }
}
