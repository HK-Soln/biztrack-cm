/// <reference types="jest" />
import { AppBadRequestException } from '@/common/exceptions/app-exceptions'
import { OnlineOrdersService } from '../online-orders.service'

const store = { id: 'store-1', businessId: 'biz-1', currency: 'XAF', minOrderAmount: null }

const makeService = (opts: {
  store?: Record<string, unknown> | null
  product?: Record<string, unknown> | null
  cart?: Record<string, unknown> | null
  saleAtConfirm?: boolean
}) => {
  const cartsRepo = {
    findOne: jest.fn().mockResolvedValue(opts.cart ?? null),
    create: jest.fn((input: any) => input),
    save: jest.fn(async (input: any) => ({ id: 'cart-1', ...input })),
    delete: jest.fn(),
  }
  const ordersRepo = {
    create: jest.fn((input: any) => input),
    save: jest.fn(async (input: any) => ({ id: 'order-1', ...input })),
    findOne: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
  }
  const eventsRepo = {
    create: jest.fn((i: any) => i),
    save: jest.fn(async (i: any) => i),
    find: jest.fn(),
  }
  const storesRepo = { findOne: jest.fn().mockResolvedValue(opts.store ?? null) }
  const productsRepo = {
    findOne: jest.fn().mockResolvedValue(opts.product ?? null),
    find: jest.fn().mockResolvedValue([]),
  }
  const variantsRepo = { findOne: jest.fn() }
  const serialUnitsRepo = { find: jest.fn().mockResolvedValue([]), update: jest.fn() }
  const contactsRepo = {
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn((i: any) => i),
    save: jest.fn(async (i: any) => ({ id: 'contact-1', ...i })),
    update: jest.fn(),
  }
  const salesService = {
    createFromSync: jest.fn(async () => ({ id: 'sale-1', saleNumber: 'V-1' })),
    findById: jest.fn(async () => ({
      id: 'sale-1',
      creditAmount: 0,
      amountPaid: 0,
      totalAmount: 0,
    })),
    recordPayment: jest.fn(async () => ({ id: 'sale-1' })),
    refund: jest.fn(async () => ({ id: 'sale-1' })),
    void: jest.fn(async () => ({ id: 'sale-1' })),
  }
  const i18n = { translate: jest.fn(async (key: string) => key) }
  const logger = { setContext: jest.fn(), warn: jest.fn(), error: jest.fn() }
  // ONLINE_SALE_AT_CONFIRM: config returns the parsed enum string ('true' | 'false'); defaults on.
  const config = { get: jest.fn(() => (opts.saleAtConfirm === false ? 'false' : 'true')) }
  const orderEmail = { sendStatusEmail: jest.fn(async () => undefined) }
  // Customer flows resolve the PUBLISHED snapshot via OnlineStoreService.
  const storeService = {
    getPublishedStore: jest.fn().mockResolvedValue(
      opts.store
        ? {
            store: opts.store,
            config: {
              currency: (opts.store as Record<string, unknown>).currency ?? 'XAF',
              minOrderAmount: (opts.store as Record<string, unknown>).minOrderAmount ?? null,
              fulfilment: {
                offerDelivery: true,
                offerPickup: true,
                deliveryFee: 0,
                deliveryCities: [],
              },
            },
          }
        : null,
    ),
  }

  const service = new OnlineOrdersService(
    cartsRepo as any,
    ordersRepo as any,
    eventsRepo as any,
    storesRepo as any,
    productsRepo as any,
    variantsRepo as any,
    serialUnitsRepo as any,
    contactsRepo as any,
    salesService as any,
    i18n as any,
    logger as any,
    storeService as any,
    config as any,
    orderEmail as any,
  )
  return { service, cartsRepo, ordersRepo, eventsRepo, contactsRepo, salesService, storeService }
}

describe('OnlineOrdersService.addItem', () => {
  it('creates a cart and adds the product with a computed subtotal', async () => {
    const { service } = makeService({
      store,
      product: { id: 'p1', name: 'Coca', sellingPrice: 500 },
      cart: null,
    })

    const cart = await service.addItem('akwa', undefined, { productId: 'p1', quantity: 2 })

    expect(cart.items).toHaveLength(1)
    expect(cart.items[0]).toMatchObject({ productId: 'p1', quantity: 2, unitPrice: 500 })
    expect(cart.subtotal).toBe(1000)
    expect(cart.sessionToken).toBeTruthy()
  })
})

describe('OnlineOrdersService.checkout', () => {
  it('rejects an empty cart', async () => {
    const { service } = makeService({
      store,
      cart: { id: 'cart-1', onlineStoreId: 'store-1', items: [] },
    })
    await expect(
      service.checkout('akwa', 'sess-1', { customerName: 'A', customerPhone: '650000000' }),
    ).rejects.toBeInstanceOf(AppBadRequestException)
  })

  it('creates a PENDING order + ORDER_PLACED event and clears the cart', async () => {
    const { service, ordersRepo, eventsRepo, cartsRepo } = makeService({
      store,
      cart: {
        id: 'cart-1',
        onlineStoreId: 'store-1',
        items: [{ productId: 'p1', quantity: 2, unitPrice: 500, productName: 'Coca' }],
      },
    })

    const result = await service.checkout('akwa', 'sess-1', {
      customerName: 'Marie',
      customerPhone: '650000000',
    })

    expect(result.status).toBe('PENDING')
    expect(result.orderNumber).toMatch(/^ORD-/)
    expect(result.trackingToken).toBeTruthy()
    expect(ordersRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ totalAmount: 1000, status: 'PENDING', saleId: null }),
    )
    expect(eventsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'ORDER_PLACED', toStatus: 'PENDING' }),
    )
    expect(cartsRepo.delete).toHaveBeenCalledWith({ id: 'cart-1' })
  })
})

describe('OnlineOrdersService.updateStatus (deferred sale)', () => {
  it('creates the sale + marks PAID when an order is delivered', async () => {
    const { service, ordersRepo, salesService } = makeService({ store })
    const order = {
      id: 'order-1',
      businessId: 'biz-1',
      fulfillmentType: 'DELIVERY',
      status: 'OUT_FOR_DELIVERY',
      paymentStatus: 'PENDING',
      saleId: null,
      orderNumber: 'ORD-1',
      trackingToken: 'tok',
      totalAmount: 1000,
      customerName: 'Marie',
      paymentMethod: null,
      items: [{ productId: 'p1', quantity: 2, unitPrice: 500 }],
    }
    ordersRepo.findOne.mockResolvedValue(order)
    ordersRepo.find = jest.fn().mockResolvedValue([])

    await service.updateStatus(
      'biz-1',
      'order-1',
      { status: 'DELIVERED' },
      { id: 'user-1', name: 'Paul' },
    )

    expect(salesService.createFromSync).toHaveBeenCalledWith(
      'biz-1',
      expect.objectContaining({ clientId: 'order-1', cashierId: 'user-1' }),
    )
    expect(ordersRepo.update).toHaveBeenCalledWith(
      'order-1',
      expect.objectContaining({ status: 'DELIVERED', saleId: 'sale-1', paymentStatus: 'PAID' }),
    )
  })
})

describe('OnlineOrdersService.updateStatus (post-at-confirm, default on)', () => {
  it('posts a COD credit sale at confirm with fees as charge lines + a guest contact', async () => {
    const { service, ordersRepo, salesService, contactsRepo } = makeService({ store })
    salesService.createFromSync = jest.fn(async () => ({
      id: 'sale-1',
      saleNumber: 'V-1',
      amountPaid: 0,
      totalAmount: 1500,
    }))
    const order = {
      id: 'order-1',
      businessId: 'biz-1',
      fulfillmentType: 'DELIVERY',
      status: 'PENDING',
      paymentStatus: 'PENDING',
      saleId: null,
      orderNumber: 'ORD-1',
      trackingToken: 'tok',
      subtotal: 1000,
      deliveryFee: 500,
      codFee: 0,
      otherCharges: 0,
      totalAmount: 1500,
      customerName: 'Marie',
      customerPhone: '650000000',
      paymentMethod: null,
      items: [{ productId: 'p1', quantity: 2, unitPrice: 500 }],
    }
    ordersRepo.findOne.mockResolvedValue(order)

    await service.updateStatus(
      'biz-1',
      'order-1',
      { status: 'CONFIRMED' },
      { id: 'user-1', name: 'Paul', role: 'OWNER' },
    )

    // A guest customer is created (no existing match) so the COD receivable can attach.
    expect(contactsRepo.save).toHaveBeenCalled()
    expect(salesService.createFromSync).toHaveBeenCalledWith(
      'biz-1',
      expect.objectContaining({
        clientId: 'order-1',
        source: 'ONLINE',
        onlineOrderId: 'order-1',
        deferSerialSold: true,
        chargesAmount: 500,
        charges: expect.arrayContaining([
          expect.objectContaining({ name: 'Delivery fee', amount: 500 }),
        ]),
        payments: [],
      }),
    )
    expect(ordersRepo.update).toHaveBeenCalledWith(
      'order-1',
      expect.objectContaining({ status: 'CONFIRMED', saleId: 'sale-1', paymentStatus: 'PENDING' }),
    )
  })
})

describe('OnlineOrdersService.updateStatus (reversal — flag-independent)', () => {
  // Reversing an existing sale must NOT depend on ONLINE_SALE_AT_CONFIRM: any order that has a
  // saleId reverses on return/cancel. Explicitly disable the flag to prove it's independent.
  it('refunds the sale (restock) when a delivered order is returned', async () => {
    const { service, ordersRepo, salesService } = makeService({ store, saleAtConfirm: false })
    const order = {
      id: 'order-1',
      businessId: 'biz-1',
      fulfillmentType: 'DELIVERY',
      status: 'DELIVERED',
      paymentStatus: 'PAID',
      saleId: 'sale-1',
      orderNumber: 'ORD-1',
      trackingToken: 'tok',
      totalAmount: 1500,
      customerName: 'Marie',
      paymentMethod: 'CASH',
      items: [{ productId: 'p1', quantity: 2, unitPrice: 500 }],
    }
    ordersRepo.findOne.mockResolvedValue(order)

    await service.updateStatus(
      'biz-1',
      'order-1',
      { status: 'RETURNED' },
      { id: 'user-1', name: 'Paul', role: 'OWNER' },
    )

    expect(salesService.refund).toHaveBeenCalledWith(
      'sale-1',
      'biz-1',
      expect.objectContaining({ sub: 'user-1' }),
      expect.objectContaining({ restock: true }),
    )
    expect(ordersRepo.update).toHaveBeenCalledWith(
      'order-1',
      expect.objectContaining({ status: 'RETURNED', paymentStatus: 'REFUNDED' }),
    )
  })

  it('voids the sale when a confirmed order with a posted sale is cancelled', async () => {
    const { service, ordersRepo, salesService } = makeService({ store, saleAtConfirm: false })
    const order = {
      id: 'order-1',
      businessId: 'biz-1',
      fulfillmentType: 'DELIVERY',
      status: 'CONFIRMED',
      paymentStatus: 'PENDING',
      saleId: 'sale-1',
      orderNumber: 'ORD-1',
      trackingToken: 'tok',
      totalAmount: 1500,
      customerName: 'Marie',
      paymentMethod: null,
      items: [{ productId: 'p1', quantity: 2, unitPrice: 500 }],
    }
    ordersRepo.findOne.mockResolvedValue(order)

    await service.updateStatus(
      'biz-1',
      'order-1',
      { status: 'CANCELLED' },
      { id: 'user-1', name: 'Paul', role: 'OWNER' },
    )

    expect(salesService.void).toHaveBeenCalledWith(
      'sale-1',
      'biz-1',
      expect.objectContaining({ sub: 'user-1', role: 'OWNER' }),
      expect.objectContaining({ reason: expect.stringContaining('cancelled') }),
    )
  })
})

describe('OnlineOrdersService.getOrder (financials)', () => {
  it('summarises the linked sale ledger (paid / balance / refunds / payments)', async () => {
    const { service, ordersRepo, salesService } = makeService({ store })
    ordersRepo.findOne.mockResolvedValue({
      id: 'order-1',
      businessId: 'biz-1',
      saleId: 'sale-1',
      orderNumber: 'ORD-1',
      status: 'DELIVERED',
      paymentStatus: 'PAID',
      totalAmount: 1500,
    })
    salesService.findById = jest.fn(async () => ({
      id: 'sale-1',
      saleNumber: 'V-1',
      status: 'COMPLETED',
      totalAmount: 1500,
      amountPaid: 1500,
      creditAmount: 0,
      chargesAmount: 500,
      payments: [
        { method: 'CASH', amount: 1500, kind: 'PAYMENT', createdAt: new Date('2026-07-01') },
      ],
    }))

    const result: any = await service.getOrder('biz-1', 'order-1')

    expect(result.financials).toMatchObject({
      saleNumber: 'V-1',
      amountPaid: 1500,
      balanceDue: 0,
      refundedAmount: 0,
      chargesAmount: 500,
    })
    expect(result.financials.payments).toHaveLength(1)
  })

  it('returns null financials for an order with no posted sale', async () => {
    const { service, ordersRepo } = makeService({ store })
    ordersRepo.findOne.mockResolvedValue({
      id: 'order-1',
      businessId: 'biz-1',
      saleId: null,
      orderNumber: 'ORD-1',
      status: 'PENDING',
    })
    const result: any = await service.getOrder('biz-1', 'order-1')
    expect(result.financials).toBeNull()
  })
})

describe('OnlineOrdersService.updatePayment', () => {
  const base = {
    id: 'order-1',
    businessId: 'biz-1',
    status: 'CONFIRMED',
    paymentStatus: 'PENDING',
    trackingToken: 'tok',
  }

  it('rejects payment on an unconfirmed (PENDING) order', async () => {
    const { service, ordersRepo } = makeService({ store })
    ordersRepo.findOne.mockResolvedValue({ ...base, status: 'PENDING' })
    await expect(
      service.updatePayment(
        'biz-1',
        'order-1',
        { paymentStatus: 'PAID', paymentMethod: 'CASH' },
        { id: 'u', name: 'P' },
      ),
    ).rejects.toBeInstanceOf(AppBadRequestException)
    expect(ordersRepo.update).not.toHaveBeenCalled()
  })

  it('rejects payment on a returned order', async () => {
    const { service, ordersRepo } = makeService({ store })
    ordersRepo.findOne.mockResolvedValue({ ...base, status: 'RETURNED', paymentStatus: 'REFUNDED' })
    await expect(
      service.updatePayment(
        'biz-1',
        'order-1',
        { paymentStatus: 'PAID', paymentMethod: 'CASH' },
        { id: 'u', name: 'P' },
      ),
    ).rejects.toBeInstanceOf(AppBadRequestException)
    expect(ordersRepo.update).not.toHaveBeenCalled()
  })

  it('rejects payment on a refunded order (even if still delivered)', async () => {
    const { service, ordersRepo } = makeService({ store })
    ordersRepo.findOne.mockResolvedValue({
      ...base,
      status: 'DELIVERED',
      paymentStatus: 'PARTIALLY_REFUNDED',
    })
    await expect(
      service.updatePayment(
        'biz-1',
        'order-1',
        { paymentStatus: 'PAID', paymentMethod: 'CASH' },
        { id: 'u', name: 'P' },
      ),
    ).rejects.toBeInstanceOf(AppBadRequestException)
    expect(ordersRepo.update).not.toHaveBeenCalled()
  })

  it('records PAID + method + a PAYMENT_RECEIVED event on a confirmed order', async () => {
    const { service, ordersRepo, eventsRepo } = makeService({ store })
    ordersRepo.findOne.mockResolvedValue(base)
    eventsRepo.find.mockResolvedValue([])
    await service.updatePayment(
      'biz-1',
      'order-1',
      { paymentStatus: 'PAID', paymentMethod: 'MTN_MOMO' },
      { id: 'u', name: 'P' },
    )
    expect(ordersRepo.update).toHaveBeenCalledWith(
      'order-1',
      expect.objectContaining({ paymentStatus: 'PAID', paymentMethod: 'MTN_MOMO' }),
    )
    expect(eventsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'PAYMENT_RECEIVED' }),
    )
  })
})
