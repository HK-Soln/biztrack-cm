/// <reference types="jest" />
import { ProductType, SerialUnitStatus } from '@biztrack/types'
import { AppBadRequestException } from '@/common/exceptions/app-exceptions'
import { Product } from '@/entities/product.entity'
import { ProductVariant } from '@/entities/product-variant.entity'
import { ProductSerialUnit } from '@/entities/product-serial-unit.entity'
import { ProductBundleComponent } from '@/entities/product-bundle-component.entity'
import { SalesService } from '../services/sales.service'

// SalesService is heavily transactional, but the per-line decision logic lives in
// three focused methods that take plain data: loadProductsForSale (validation),
// expandSaleItemsForInventory (bundle/serialised expansion) and computeSale
// (totals + variant/serial field resolution). We exercise those directly with a
// mocked EntityManager, matching the makeService style used by deduct-for-sale.spec.

type RepoRows = {
  products?: Partial<Product>[]
  variants?: Partial<ProductVariant>[]
  serialUnits?: Partial<ProductSerialUnit>[]
  components?: Partial<ProductBundleComponent>[]
}

function makeManager(rows: RepoRows) {
  const repoFor = (entity: unknown) => {
    if (entity === Product) return { find: jest.fn(async () => rows.products ?? []) }
    if (entity === ProductVariant) return { find: jest.fn(async () => rows.variants ?? []) }
    if (entity === ProductSerialUnit) return { find: jest.fn(async () => rows.serialUnits ?? []) }
    if (entity === ProductBundleComponent)
      return { find: jest.fn(async () => rows.components ?? []) }
    return { find: jest.fn(async () => []) }
  }
  return { getRepository: jest.fn((entity: unknown) => repoFor(entity)) } as any
}

function makeService() {
  const i18n = { translate: jest.fn(async (key: string) => key) }
  const logger = { setContext: jest.fn(), warn: jest.fn(), error: jest.fn() }
  const service = new SalesService(
    {} as any, // dataSource
    {} as any, // businessesRepo
    {} as any, // salesRepo
    {} as any, // contactsRepo
    {} as any, // procurementSend
    {} as any, // debtsService
    {} as any, // inventoryService
    {} as any, // savingsService
    {} as any, // saleNumberService
    {} as any, // dailySummaryService
    {} as any, // auditService
    i18n as any,
    logger as any,
  )
  return service as any
}

const product = (over: Partial<Product>): Partial<Product> => ({
  businessId: 'biz-1',
  name: 'Product',
  isActive: true,
  hasVariants: false,
  isSerialized: false,
  productType: ProductType.SIMPLE,
  sellingPrice: 1000,
  costPrice: 600,
  ...over,
})

describe('SalesService.loadProductsForSale (validation)', () => {
  it('requires a variantId for products with variants', async () => {
    const service = makeService()
    const mgr = makeManager({ products: [product({ id: 'p1', hasVariants: true })] })
    await expect(
      service.loadProductsForSale(mgr, 'biz-1', { items: [{ productId: 'p1', quantity: 1, unitPrice: 1000 }] }),
    ).rejects.toMatchObject({ code: 'VARIANT_REQUIRED' })
  })

  it('rejects a variant that belongs to another product', async () => {
    const service = makeService()
    const mgr = makeManager({
      products: [product({ id: 'p1', hasVariants: true })],
      variants: [{ id: 'v1', productId: 'OTHER', businessId: 'biz-1', isActive: true } as any],
    })
    await expect(
      service.loadProductsForSale(mgr, 'biz-1', {
        items: [{ productId: 'p1', variantId: 'v1', quantity: 1, unitPrice: 1000 }],
      }),
    ).rejects.toMatchObject({ code: 'VARIANT_NOT_FOUND' })
  })

  it('rejects a fractional quantity on a SIMPLE product', async () => {
    const service = makeService()
    const mgr = makeManager({ products: [product({ id: 'p1', productType: ProductType.SIMPLE })] })
    await expect(
      service.loadProductsForSale(mgr, 'biz-1', {
        items: [{ productId: 'p1', quantity: 1.5, unitPrice: 1000 }],
      }),
    ).rejects.toMatchObject({ code: 'QUANTITY_MUST_BE_INTEGER' })
  })

  it('accepts a fractional quantity on a VARIABLE_QUANTITY product', async () => {
    const service = makeService()
    const mgr = makeManager({
      products: [product({ id: 'p1', productType: ProductType.VARIABLE_QUANTITY })],
    })
    await expect(
      service.loadProductsForSale(mgr, 'biz-1', {
        items: [{ productId: 'p1', quantity: 1.5, unitPrice: 1000 }],
      }),
    ).resolves.toBeDefined()
  })

  it('requires a serialUnitId for serialised products', async () => {
    const service = makeService()
    const mgr = makeManager({ products: [product({ id: 'p1', isSerialized: true })] })
    await expect(
      service.loadProductsForSale(mgr, 'biz-1', {
        items: [{ productId: 'p1', quantity: 1, unitPrice: 1000 }],
      }),
    ).rejects.toMatchObject({ code: 'SERIAL_UNIT_REQUIRED' })
  })

  it('rejects a serial unit that is not in stock', async () => {
    const service = makeService()
    const mgr = makeManager({
      products: [product({ id: 'p1', isSerialized: true })],
      serialUnits: [{ id: 's1', productId: 'p1', businessId: 'biz-1', status: SerialUnitStatus.SOLD } as any],
    })
    await expect(
      service.loadProductsForSale(mgr, 'biz-1', {
        items: [{ productId: 'p1', serialUnitId: 's1', quantity: 1, unitPrice: 1000 }],
      }),
    ).rejects.toMatchObject({ code: 'SERIAL_UNIT_UNAVAILABLE' })
  })

  it('rejects a serial unit whose variant does not match the line variant', async () => {
    const service = makeService()
    const mgr = makeManager({
      products: [product({ id: 'p1', isSerialized: true, hasVariants: true })],
      variants: [{ id: 'v1', productId: 'p1', businessId: 'biz-1', isActive: true } as any],
      serialUnits: [
        { id: 's1', productId: 'p1', businessId: 'biz-1', status: SerialUnitStatus.IN_STOCK, variantId: 'v2' } as any,
      ],
    })
    await expect(
      service.loadProductsForSale(mgr, 'biz-1', {
        items: [{ productId: 'p1', variantId: 'v1', serialUnitId: 's1', quantity: 1, unitPrice: 1000 }],
      }),
    ).rejects.toMatchObject({ code: 'SERIAL_UNIT_VARIANT_MISMATCH' })
  })

  it('accepts an in-stock serial unit with a matching variant', async () => {
    const service = makeService()
    const mgr = makeManager({
      products: [product({ id: 'p1', isSerialized: true, hasVariants: true })],
      variants: [{ id: 'v1', productId: 'p1', businessId: 'biz-1', isActive: true } as any],
      serialUnits: [
        { id: 's1', productId: 'p1', businessId: 'biz-1', status: SerialUnitStatus.IN_STOCK, variantId: 'v1' } as any,
      ],
    })
    await expect(
      service.loadProductsForSale(mgr, 'biz-1', {
        items: [{ productId: 'p1', variantId: 'v1', serialUnitId: 's1', quantity: 1, unitPrice: 1000 }],
      }),
    ).resolves.toBeDefined()
  })

  it('rejects an inactive product', async () => {
    const service = makeService()
    const mgr = makeManager({ products: [product({ id: 'p1', isActive: false })] })
    await expect(
      service.loadProductsForSale(mgr, 'biz-1', {
        items: [{ productId: 'p1', quantity: 1, unitPrice: 1000 }],
      }),
    ).rejects.toMatchObject({ code: 'PRODUCT_INACTIVE' })
  })
})

describe('SalesService.expandSaleItemsForInventory (bundle/serial expansion)', () => {
  const line = (over: any) => ({ productId: 'p1', productName: 'P', quantity: 1, ...over })

  it('expands a COMPOSITE into its components × line quantity', async () => {
    const service = makeService()
    const mgr = makeManager({
      products: [product({ id: 'b1', productType: ProductType.COMPOSITE })],
      components: [
        { bundleProductId: 'b1', componentProductId: 'c1', businessId: 'biz-1', quantity: 2 } as any,
        { bundleProductId: 'b1', componentProductId: 'c2', businessId: 'biz-1', quantity: 1 } as any,
      ],
    })
    const expanded = await service.expandSaleItemsForInventory(mgr, 'biz-1', [
      line({ productId: 'b1', quantity: 3 }),
    ])
    expect(expanded).toHaveLength(2)
    expect(expanded).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ productId: 'c1', quantity: 6 }),
        expect.objectContaining({ productId: 'c2', quantity: 3 }),
      ]),
    )
  })

  it('selling 2 bundles deducts 2× from each component', async () => {
    const service = makeService()
    const mgr = makeManager({
      products: [product({ id: 'b1', productType: ProductType.COMPOSITE })],
      components: [
        { bundleProductId: 'b1', componentProductId: 'c1', businessId: 'biz-1', quantity: 3 } as any,
      ],
    })
    const expanded = await service.expandSaleItemsForInventory(mgr, 'biz-1', [
      line({ productId: 'b1', quantity: 2 }),
    ])
    expect(expanded).toHaveLength(1)
    expect(expanded[0]).toMatchObject({ productId: 'c1', quantity: 6 })
  })

  it('skips serialised products (stock tracked by unit, not levels)', async () => {
    const service = makeService()
    const mgr = makeManager({ products: [product({ id: 'p1', isSerialized: true })] })
    const expanded = await service.expandSaleItemsForInventory(mgr, 'biz-1', [line({ productId: 'p1' })])
    expect(expanded).toHaveLength(0)
  })

  it('passes SIMPLE products through unchanged', async () => {
    const service = makeService()
    const mgr = makeManager({ products: [product({ id: 'p1', productType: ProductType.SIMPLE })] })
    const expanded = await service.expandSaleItemsForInventory(mgr, 'biz-1', [
      line({ productId: 'p1', variantId: 'v1', quantity: 4 }),
    ])
    expect(expanded).toHaveLength(1)
    expect(expanded[0]).toMatchObject({ productId: 'p1', variantId: 'v1', quantity: 4 })
  })
})

describe('SalesService.computeSale (totals + variant/serial fields)', () => {
  it('sets variant id/name and serial number on the computed line', () => {
    const service = makeService()
    const p = product({ id: 'p1', hasVariants: true, isSerialized: true, sellingPrice: 1000 }) as Product
    const variants = new Map([['v1', { id: 'v1', name: 'Black 128GB', productId: 'p1' } as any]])
    const serials = new Map([['s1', { id: 's1', serialNumber: '359874100001234' } as any]])
    const result = service.computeSale([p], variants, serials, {
      items: [{ productId: 'p1', variantId: 'v1', serialUnitId: 's1', quantity: 1, unitPrice: 1000 }],
    })
    expect(result.items[0]).toMatchObject({
      variantId: 'v1',
      variantName: 'Black 128GB',
      serialUnitId: 's1',
      serialNumber: '359874100001234',
      lineTotal: 1000,
    })
    expect(result.subtotal).toBe(1000)
    expect(result.totalAmount).toBe(1000)
  })

  it('preserves a fractional quantity and computes the line total', () => {
    const service = makeService()
    const p = product({ id: 'p1', productType: ProductType.VARIABLE_QUANTITY, sellingPrice: 800 }) as Product
    const result = service.computeSale([p], new Map(), new Map(), {
      items: [{ productId: 'p1', quantity: 1.5, unitPrice: 800 }],
    })
    expect(result.items[0].quantity).toBe(1.5)
    expect(result.items[0].lineTotal).toBe(1200)
    expect(result.totalAmount).toBe(1200)
  })

  it('applies sale-level discount and charges to the total', () => {
    const service = makeService()
    const p = product({ id: 'p1', sellingPrice: 1000 }) as Product
    const result = service.computeSale([p], new Map(), new Map(), {
      discountAmount: 200,
      chargesAmount: 50,
      items: [{ productId: 'p1', quantity: 2, unitPrice: 1000 }],
    })
    expect(result.subtotal).toBe(2000)
    expect(result.saleDiscountAmount).toBe(200)
    expect(result.saleChargesAmount).toBe(50)
    expect(result.totalAmount).toBe(1850)
  })
})
