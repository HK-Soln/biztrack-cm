/// <reference types="jest" />
import { AppNotFoundException } from '@/common/exceptions/app-exceptions'
import { PublicStorefrontService } from '../public-storefront.service'

const makeService = (opts: {
  store?: Record<string, unknown> | null
  products?: Array<Record<string, unknown>>
  levels?: Array<{ productId: string; quantity: number }>
}) => {
  const storesRepo = { findOne: jest.fn().mockResolvedValue(opts.store ?? null) }
  const productsQb = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([opts.products ?? [], (opts.products ?? []).length]),
  }
  const productsRepo = {
    find: jest.fn().mockResolvedValue(opts.products ?? []),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(() => productsQb),
  }
  const inventoryRepo = { find: jest.fn().mockResolvedValue(opts.levels ?? []) }
  const imagesRepo = { find: jest.fn().mockResolvedValue([]) }
  const serialUnitsRepo = { createQueryBuilder: jest.fn() }
  const categoriesService = { getTree: jest.fn() }
  const variantsService = { listVariantsForProduct: jest.fn() }
  const i18n = { translate: jest.fn(async (key: string) => key) }

  const service = new PublicStorefrontService(
    storesRepo as any,
    productsRepo as any,
    inventoryRepo as any,
    imagesRepo as any,
    serialUnitsRepo as any,
    categoriesService as any,
    variantsService as any,
    i18n as any,
  )
  return { service, storesRepo, productsRepo }
}

const store = {
  businessId: 'biz-1',
  storeName: 'Akwa Boutique',
  storeSlug: 'akwa',
  primaryColor: '#1D9E75',
  currency: 'XAF',
  showOutOfStock: false,
  allowOrderNotes: true,
  minOrderAmount: null,
  paymentCashOnDelivery: true,
  paymentMtnMomo: false,
  paymentOrangeMoney: false,
  paymentCard: false,
}

describe('PublicStorefrontService', () => {
  it('throws when the store slug is unknown / inactive', async () => {
    const { service } = makeService({ store: null })
    await expect(service.getStore('missing')).rejects.toBeInstanceOf(AppNotFoundException)
  })

  it('maps the store config to the public shape', async () => {
    const { service } = makeService({ store })
    const result = await service.getStore('akwa')
    expect(result).toMatchObject({
      storeName: 'Akwa Boutique',
      storeSlug: 'akwa',
      currency: 'XAF',
      paymentMethods: { cashOnDelivery: true, mtnMomo: false },
    })
  })

  it('computes effective online stock (quantity − reserve) and hides out-of-stock', async () => {
    const { service } = makeService({
      store,
      products: [
        { id: 'p1', name: 'A', slug: 'a', sellingPrice: 1000, isSerialized: false, hasVariants: false, onlineStockReserve: 2 },
        { id: 'p2', name: 'B', slug: 'b', sellingPrice: 500, isSerialized: false, hasVariants: false, onlineStockReserve: 0 },
      ],
      levels: [
        { productId: 'p1', quantity: 5 },
        { productId: 'p2', quantity: 0 },
      ],
    })

    const result = await service.listProducts('akwa')
    // p1: 5 - 2 = 3 in stock (shown); p2: 0 (hidden, showOutOfStock = false)
    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toMatchObject({ id: 'p1', inStock: 3 })
    expect(result.total).toBe(2)
  })
})
