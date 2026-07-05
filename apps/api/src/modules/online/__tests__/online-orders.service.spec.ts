/// <reference types="jest" />
import { AppBadRequestException } from '@/common/exceptions/app-exceptions'
import { OnlineOrdersService } from '../online-orders.service'

const store = { id: 'store-1', businessId: 'biz-1', currency: 'XAF', minOrderAmount: null }

const makeService = (opts: {
  store?: Record<string, unknown> | null
  product?: Record<string, unknown> | null
  cart?: Record<string, unknown> | null
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
  const productsRepo = { findOne: jest.fn().mockResolvedValue(opts.product ?? null) }
  const variantsRepo = { findOne: jest.fn() }
  const salesService = {
    createFromSync: jest.fn(async () => ({ id: 'sale-1', saleNumber: 'V-1' })),
  }
  const i18n = { translate: jest.fn(async (key: string) => key) }
  const logger = { setContext: jest.fn(), warn: jest.fn(), error: jest.fn() }
  // Customer flows resolve the PUBLISHED snapshot via OnlineStoreService.
  const storeService = {
    getPublishedStore: jest.fn().mockResolvedValue(
      opts.store
        ? {
            store: opts.store,
            config: {
              currency: (opts.store as Record<string, unknown>).currency ?? 'XAF',
              minOrderAmount: (opts.store as Record<string, unknown>).minOrderAmount ?? null,
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
    salesService as any,
    i18n as any,
    logger as any,
    storeService as any,
  )
  return { service, cartsRepo, ordersRepo, eventsRepo, salesService, storeService }
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
