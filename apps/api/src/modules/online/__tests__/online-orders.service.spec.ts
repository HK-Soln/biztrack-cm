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
  const eventsRepo = { create: jest.fn((i: any) => i), save: jest.fn(async (i: any) => i), find: jest.fn() }
  const storesRepo = { findOne: jest.fn().mockResolvedValue(opts.store ?? null) }
  const productsRepo = { findOne: jest.fn().mockResolvedValue(opts.product ?? null) }
  const variantsRepo = { findOne: jest.fn() }
  const i18n = { translate: jest.fn(async (key: string) => key) }
  const logger = { setContext: jest.fn(), warn: jest.fn(), error: jest.fn() }

  const service = new OnlineOrdersService(
    cartsRepo as any,
    ordersRepo as any,
    eventsRepo as any,
    storesRepo as any,
    productsRepo as any,
    variantsRepo as any,
    i18n as any,
    logger as any,
  )
  return { service, cartsRepo, ordersRepo, eventsRepo }
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
    const { service } = makeService({ store, cart: { id: 'cart-1', onlineStoreId: 'store-1', items: [] } })
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
