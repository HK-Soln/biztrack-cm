import { randomUUID } from 'crypto'
import type { DataSource } from 'typeorm'
import { SaleSource } from '@biztrack/types'
import { Contact } from '@/entities/contact.entity'
import { Debt } from '@/entities/debt.entity'
import { OnlineCustomer } from '@/entities/online-customer.entity'
import { OnlineOrder } from '@/entities/online-order.entity'
import { ContactsService } from '@/modules/debts/services/contacts.service'
import { OnlineCustomersService } from '@/modules/online/online-customers.service'
import { OnlineCustomers1790800000000 } from '@/database/migrations/1790800000000-online_customers'
import {
  closeIntegrationDataSource,
  getIntegrationDataSource,
} from '@/testing/integration-database'
import { createSalesSyncHarness, type SalesSyncHarness } from '@/testing/sales-sync-harness'

// Ruling R20 against a real Postgres: online buyers are online customers, not contacts. A
// returning buyer is recognised by phone or email; the shop adds one to its contacts through
// the contact rules; and an online order's cash on delivery is collected on the order, so
// its sale needs no customer and opens no debt.

describe('online customers', () => {
  let dataSource: DataSource
  let h: SalesSyncHarness
  let customers: OnlineCustomersService
  let storeId: string

  beforeAll(async () => {
    dataSource = await getIntegrationDataSource()
  })
  afterAll(async () => {
    await closeIntegrationDataSource()
  })
  beforeEach(async () => {
    h = await createSalesSyncHarness(dataSource)
    storeId = randomUUID()
    await dataSource.query(
      `INSERT INTO online_stores (id, business_id, store_name, store_slug) VALUES ($1, $2, 'Shop', $3)`,
      [storeId, h.businessId, `shop-${storeId.slice(0, 8)}`],
    )
    const noop = () => undefined
    const contacts = new ContactsService(
      dataSource.getRepository(Contact),
      dataSource.getRepository(Debt),
      {} as never,
      {} as never,
      { assertWithinQuota: async () => undefined } as never,
      { translate: async (key: string) => key } as never,
      { setContext: noop, log: noop, warn: noop, error: noop, debug: noop } as never,
    )
    customers = new OnlineCustomersService(
      dataSource.getRepository(OnlineCustomer),
      dataSource.getRepository(OnlineOrder),
      dataSource.getRepository(Contact),
      contacts,
    )
  })

  /** An order placed on the storefront, filed under its buyer as checkout does. */
  const placeOrder = async (buyer: { name: string; phone?: string; email?: string }) => {
    const repo = dataSource.getRepository(OnlineOrder)
    const order = await repo.save(
      repo.create({
        onlineStoreId: storeId,
        businessId: h.businessId,
        orderNumber: `ORD-${randomUUID().slice(0, 12)}`,
        trackingToken: randomUUID().replace(/-/g, ''),
        items: [],
        totalAmount: 1500,
        customerName: buyer.name,
        customerPhone: buyer.phone ?? null,
        customerEmail: buyer.email ?? null,
        status: 'PENDING',
        paymentStatus: 'PENDING',
      }),
    )
    const customer = await customers.recordOrder(null, order, new Date())
    await repo.update(order.id, { onlineCustomerId: customer.id })
    return { order, customer }
  }

  it('recognises a returning buyer by phone or email, however it is typed', async () => {
    const first = await placeOrder({ name: 'Marie', phone: '650 00 00 00' })
    const again = await placeOrder({ name: 'Marie N.', phone: '+237650000000' })
    expect(again.customer.id).toBe(first.customer.id)
    const byEmail = await placeOrder({ name: 'Marie', phone: '699111222', email: 'M@x.cm' })
    expect(byEmail.customer.id).not.toBe(first.customer.id)
    const third = await placeOrder({ name: 'Marie', email: 'm@x.cm' })
    expect(third.customer.id).toBe(byEmail.customer.id)

    const view = await customers.get(h.businessId, first.customer.id)
    expect(view).toMatchObject({
      name: 'Marie N.',
      phone: '+237650000000',
      orderCount: 2,
      totalSpent: 3000,
      contactId: null,
    })
    // No contact was made for anyone.
    expect(
      await dataSource.getRepository(Contact).count({ where: { businessId: h.businessId } }),
    ).toBe(0)
  })

  it('adds a buyer to the contacts through the contact rules', async () => {
    const { customer } = await placeOrder({ name: 'Marie', phone: '650000000' })
    const added = await customers.addToContacts(h.businessId, h.actor() as never, customer.id)
    expect(added.contactId).toBeTruthy()
    expect(added.contactName).toBe('Marie')

    // Another buyer with the same name and phone is a duplicate of that contact.
    const other = await placeOrder({ name: 'Marie', email: 'other@x.cm' })
    await expect(
      customers.addToContacts(h.businessId, h.actor() as never, other.customer.id),
    ).rejects.toMatchObject({ code: 'CONTACT_NAME_TAKEN' })
    const twin = await placeOrder({ name: 'Marie K', phone: '677000111' })
    await dataSource
      .getRepository(OnlineCustomer)
      .update(twin.customer.id, { phone: '+237650000000' })
    await expect(
      customers.addToContacts(h.businessId, h.actor() as never, twin.customer.id),
    ).rejects.toMatchObject({ code: 'CONTACT_DUPLICATE' })
    const merged = await customers.addToContacts(
      h.businessId,
      h.actor() as never,
      twin.customer.id,
      'MERGE',
    )
    expect(merged.contactId).toBe(added.contactId)
  })

  it('posts an online order paid on delivery with no customer and no debt', async () => {
    const productId = await h.seedProduct({ price: 1500, stock: 5 })
    const { order } = await placeOrder({ name: 'Marie', phone: '650000000' })
    const payload = h.salePayload({
      items: [{ productId, quantity: 1, unitPrice: 1500 }],
      paid: 0,
      overrides: { source: SaleSource.ONLINE, onlineOrderId: order.id },
    })
    const sale = await h.sales.createFromSync(h.businessId, payload)
    expect(sale).toMatchObject({ creditAmount: 1500 })
    expect(await h.debtOf(payload.saleId)).toBeNull()
  })

  it('files existing orders under one online customer per buyer on deploy', async () => {
    const repo = dataSource.getRepository(OnlineOrder)
    const contactId = (
      await customers.addToContacts(
        h.businessId,
        h.actor() as never,
        (await placeOrder({ name: 'Old', phone: '600000001' })).customer.id,
      )
    ).contactId
    const productId = await h.seedProduct({ price: 1000, stock: 5 })
    const payload = h.salePayload({
      items: [{ productId, quantity: 1, unitPrice: 1000 }],
      overrides: { customerId: contactId! },
    })
    await h.sales.createFromSync(h.businessId, payload)
    const legacy = (phone: string | null, email: string | null, saleId: string | null = null) =>
      repo.save(
        repo.create({
          onlineStoreId: storeId,
          businessId: h.businessId,
          orderNumber: `ORD-${randomUUID().slice(0, 12)}`,
          trackingToken: randomUUID().replace(/-/g, ''),
          items: [],
          totalAmount: 1000,
          customerName: 'Legacy',
          customerPhone: phone,
          customerEmail: email,
          status: 'PENDING',
          paymentStatus: 'PENDING',
          saleId,
        }),
      )
    const a = await legacy('699 00 00 01', null, payload.saleId)
    const b = await legacy('+237699000001', 'L@x.cm')
    const c = await legacy(null, 'l@x.cm')
    const d = await legacy('699000002', null)

    await new OnlineCustomers1790800000000().up(dataSource.createQueryRunner())

    const filed = await repo.find({
      where: [{ id: a.id }, { id: b.id }, { id: c.id }, { id: d.id }],
    })
    const of = (id: string) => filed.find((o) => o.id === id)!.onlineCustomerId
    expect(of(a.id)).toBeTruthy()
    expect(of(b.id)).toBe(of(a.id))
    expect(of(c.id)).toBe(of(a.id))
    expect(of(d.id)).not.toBe(of(a.id))
    expect(await customers.get(h.businessId, of(a.id)!)).toMatchObject({
      orderCount: 3,
      phone: '+237699000001',
      email: 'l@x.cm',
      contactId,
    })
  })

  it('still refuses a balance with no customer from a till claiming an order it has not', async () => {
    const productId = await h.seedProduct({ price: 1500, stock: 5 })
    const payload = h.salePayload({
      items: [{ productId, quantity: 1, unitPrice: 1500 }],
      paid: 0,
      overrides: { source: SaleSource.ONLINE, onlineOrderId: randomUUID() },
    })
    await expect(h.sales.createFromSync(h.businessId, payload)).rejects.toMatchObject({
      code: 'CUSTOMER_CONTACT_REQUIRED_FOR_CREDIT',
    })
  })
})
