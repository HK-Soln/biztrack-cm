import { randomUUID } from 'crypto'
import { MigrationInterface, QueryRunner } from 'typeorm'
import { findOnlineCustomer, onlineBuyerKeys } from '@biztrack/domain'

/**
 * Ruling R20 (docs/design/domain-package.md): online buyers are not contacts. Adds
 * `online_customers` and `online_orders.online_customer_id`, and files every existing order
 * under one online customer per buyer (matched by phone, then email). Where an order's sale
 * was already charged to a contact (the guest contact earlier orders created), that contact
 * stays linked to the online customer. Existing contacts and debts are left as they are.
 */
export class OnlineCustomers1790800000000 implements MigrationInterface {
  name = 'OnlineCustomers1790800000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "online_customers" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "business_id" uuid NOT NULL,
        "name" character varying(200) NOT NULL,
        "phone" character varying(30),
        "email" character varying(300),
        "order_count" integer NOT NULL DEFAULT 0,
        "first_order_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "last_order_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "contact_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )`)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_online_customers_business" ON "online_customers" ("business_id", "last_order_at")`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_online_customers_phone" ON "online_customers" ("business_id", "phone")`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_online_customers_email" ON "online_customers" ("business_id", "email")`,
    )
    await queryRunner.query(
      `ALTER TABLE "online_orders" ADD COLUMN IF NOT EXISTS "online_customer_id" uuid`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_online_orders_customer" ON "online_orders" ("online_customer_id")`,
    )

    const orders = (await queryRunner.query(
      `SELECT o.id, o.business_id, o.customer_name, o.customer_phone, o.customer_email,
              o.created_at, s.customer_id
         FROM online_orders o
         LEFT JOIN sales s ON s.id = o.sale_id
        WHERE o.online_customer_id IS NULL
        ORDER BY o.business_id, o.created_at, o.id`,
    )) as Array<{
      id: string
      business_id: string
      customer_name: string
      customer_phone: string | null
      customer_email: string | null
      created_at: Date
      customer_id: string | null
    }>

    type Known = {
      id: string
      phone: string | null
      email: string | null
      name: string
      count: number
      first: Date
      last: Date
      contactId: string | null
    }
    const byBusiness = new Map<string, Known[]>()
    const orderCustomer: Array<[string, Known]> = []
    for (const order of orders) {
      const known = byBusiness.get(order.business_id) ?? []
      byBusiness.set(order.business_id, known)
      const buyer = { phone: order.customer_phone, email: order.customer_email }
      let customer = findOnlineCustomer(buyer, known)
      if (!customer) {
        const keys = onlineBuyerKeys(buyer)
        customer = {
          id: randomUUID(),
          ...keys,
          name: order.customer_name,
          count: 0,
          first: order.created_at,
          last: order.created_at,
          contactId: null,
        }
        known.push(customer)
      }
      // Keys from an email-only match pick up the phone the buyer gave later, and so on.
      const keys = onlineBuyerKeys(buyer)
      customer.phone = customer.phone ?? keys.phone
      customer.email = customer.email ?? keys.email
      customer.name = order.customer_name
      customer.count += 1
      customer.last = order.created_at
      customer.contactId = customer.contactId ?? order.customer_id
      orderCustomer.push([order.id, customer])
    }

    for (const [businessId, known] of byBusiness) {
      for (const c of known) {
        await queryRunner.query(
          `INSERT INTO online_customers
             (id, business_id, name, phone, email, order_count, first_order_at, last_order_at, contact_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [c.id, businessId, c.name, c.phone, c.email, c.count, c.first, c.last, c.contactId],
        )
      }
    }
    for (const [orderId, customer] of orderCustomer) {
      await queryRunner.query(`UPDATE online_orders SET online_customer_id = $1 WHERE id = $2`, [
        customer.id,
        orderId,
      ])
    }
    // eslint-disable-next-line no-console -- one-time change: the deploy log is its report
    console.log(
      `[online_customers] filed ${orders.length} order(s) under ${[...byBusiness.values()].reduce((n, k) => n + k.length, 0)} online customer(s)`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_online_orders_customer"`)
    await queryRunner.query(
      `ALTER TABLE "online_orders" DROP COLUMN IF EXISTS "online_customer_id"`,
    )
    await queryRunner.query(`DROP TABLE IF EXISTS "online_customers"`)
  }
}
