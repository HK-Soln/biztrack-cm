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
      service.loadProductsForSale(mgr, 'biz-1', {
        items: [{ productId: 'p1', quantity: 1, unitPrice: 1000 }],
      }),
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
      serialUnits: [
        { id: 's1', productId: 'p1', businessId: 'biz-1', status: SerialUnitStatus.SOLD } as any,
      ],
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
        {
          id: 's1',
          productId: 'p1',
          businessId: 'biz-1',
          status: SerialUnitStatus.IN_STOCK,
          variantId: 'v2',
        } as any,
      ],
    })
    await expect(
      service.loadProductsForSale(mgr, 'biz-1', {
        items: [
          { productId: 'p1', variantId: 'v1', serialUnitId: 's1', quantity: 1, unitPrice: 1000 },
        ],
      }),
    ).rejects.toMatchObject({ code: 'SERIAL_UNIT_VARIANT_MISMATCH' })
  })

  it('accepts an in-stock serial unit with a matching variant', async () => {
    const service = makeService()
    const mgr = makeManager({
      products: [product({ id: 'p1', isSerialized: true, hasVariants: true })],
      variants: [{ id: 'v1', productId: 'p1', businessId: 'biz-1', isActive: true } as any],
      serialUnits: [
        {
          id: 's1',
          productId: 'p1',
          businessId: 'biz-1',
          status: SerialUnitStatus.IN_STOCK,
          variantId: 'v1',
        } as any,
      ],
    })
    await expect(
      service.loadProductsForSale(mgr, 'biz-1', {
        items: [
          { productId: 'p1', variantId: 'v1', serialUnitId: 's1', quantity: 1, unitPrice: 1000 },
        ],
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
        {
          bundleProductId: 'b1',
          componentProductId: 'c1',
          businessId: 'biz-1',
          quantity: 2,
        } as any,
        {
          bundleProductId: 'b1',
          componentProductId: 'c2',
          businessId: 'biz-1',
          quantity: 1,
        } as any,
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
        {
          bundleProductId: 'b1',
          componentProductId: 'c1',
          businessId: 'biz-1',
          quantity: 3,
        } as any,
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
    const expanded = await service.expandSaleItemsForInventory(mgr, 'biz-1', [
      line({ productId: 'p1' }),
    ])
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
    const p = product({
      id: 'p1',
      hasVariants: true,
      isSerialized: true,
      sellingPrice: 1000,
    }) as Product
    const variants = new Map([['v1', { id: 'v1', name: 'Black 128GB', productId: 'p1' } as any]])
    const serials = new Map([['s1', { id: 's1', serialNumber: '359874100001234' } as any]])
    const result = service.computeSale([p], variants, serials, {
      items: [
        { productId: 'p1', variantId: 'v1', serialUnitId: 's1', quantity: 1, unitPrice: 1000 },
      ],
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
    const p = product({
      id: 'p1',
      productType: ProductType.VARIABLE_QUANTITY,
      sellingPrice: 800,
    }) as Product
    const result = service.computeSale([p], new Map(), new Map(), {
      items: [{ productId: 'p1', quantity: 1.5, unitPrice: 800 }],
    })
    expect(result.items[0].quantity).toBe(1.5)
    expect(result.items[0].lineTotal).toBe(1200)
    expect(result.totalAmount).toBe(1200)
  })

  it('captures unit_price_listed (defaulting to the charged price) and a zero cart alloc', () => {
    const service = makeService()
    const p = product({ id: 'p1', sellingPrice: 1000 }) as Product
    // No listed price supplied → defaults to the charged unitPrice.
    const plain = service.computeSale([p], new Map(), new Map(), {
      items: [{ productId: 'p1', quantity: 1, unitPrice: 1000 }],
    })
    expect(plain.items[0].unitPriceListed).toBe(1000)
    expect(plain.items[0].cartDiscountAlloc).toBe(0)

    // A bargained-down price rungs at listed with the gap as a discount (BIZ-1.2);
    // the catalogue price is preserved and the line total still nets to the agreed price.
    const overridden = service.computeSale([p], new Map(), new Map(), {
      items: [{ productId: 'p1', quantity: 1, unitPrice: 900, unitPriceListed: 1000 }],
    })
    expect(overridden.items[0].unitPrice).toBe(1000)
    expect(overridden.items[0].unitPriceListed).toBe(1000)
    expect(overridden.items[0].discountAmount).toBe(100)
    expect(overridden.items[0].lineTotal).toBe(900)
  })

  it('rungs a bargained line at the listed price and reconciles the OVERRIDE discount', () => {
    const service = makeService()
    const p = product({ id: 'p1', sellingPrice: 1000 }) as Product
    // Agreed 900 on a 1000-listed line, qty 2 → 200 override discount.
    const r = service.computeSale([p], new Map(), new Map(), {
      items: [{ productId: 'p1', quantity: 2, unitPrice: 900, unitPriceListed: 1000 }],
    })
    const item = r.items[0]
    expect(item.unitPrice).toBe(1000) // rung at listed
    expect(item.discountAmount).toBe(200) // the bargain folded in
    expect(item.lineTotal).toBe(1800) // 1000*2 − 200 = 900*2
    // The per-line invariant: discount_amount === Σ that line's line discounts.
    expect(item.lineDiscounts.map((d: { discountType: string }) => d.discountType)).toEqual([
      'OVERRIDE',
    ])
    const lineDiscountSum = item.lineDiscounts
      .map((d: { amount: number }) => d.amount)
      .reduce((s: number, n: number) => s + n, 0)
    expect(lineDiscountSum).toBe(item.discountAmount)
  })

  it('keeps a price above listed as a markup, never a negative discount', () => {
    const service = makeService()
    const p = product({ id: 'p1', sellingPrice: 1000 }) as Product
    const r = service.computeSale([p], new Map(), new Map(), {
      items: [{ productId: 'p1', quantity: 1, unitPrice: 1100, unitPriceListed: 1000 }],
    })
    const item = r.items[0]
    expect(item.unitPrice).toBe(1100)
    expect(item.discountAmount).toBe(0)
    expect(item.lineDiscounts).toEqual([])
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

  it('allocates the cart-level discount across lines into cart_discount_alloc (BIZ-1.3)', () => {
    const service = makeService()
    const p1 = product({ id: 'p1', sellingPrice: 1000 }) as Product
    const p2 = product({ id: 'p2', sellingPrice: 1000 }) as Product
    const r = service.computeSale([p1, p2], new Map(), new Map(), {
      discountAmount: 300,
      items: [
        { productId: 'p1', quantity: 2, unitPrice: 1000 }, // line 2000
        { productId: 'p2', quantity: 1, unitPrice: 1000 }, // line 1000
      ],
    })
    const allocs = r.items.map((i: { cartDiscountAlloc: number }) => i.cartDiscountAlloc)
    expect(allocs).toEqual([200, 100]) // 2:1 weight, exact
    expect(allocs[0] + allocs[1]).toBe(300)
    expect(r.items.map((i: { lineTotal: number }) => i.lineTotal)).toEqual([1800, 900]) // reduced by their share
    expect(r.totalAmount).toBe(2700) // 3000 − 300, unchanged by the split
  })
})

describe('SalesService.recomputeSaleSettlement (signed ledger)', () => {
  // amountPaid = Σ(PAYMENT) − Σ(REFUND), clamped ≥ 0; creditAmount = max(0, total − amountPaid).
  const mgrWith = (rows: Array<{ kind?: string; amount: number }>) =>
    ({ getRepository: () => ({ find: jest.fn(async () => rows) }) }) as any

  it('sums PAYMENT rows into amountPaid, leaving the balance as credit', async () => {
    const service = makeService()
    const r = await service.recomputeSaleSettlement(
      mgrWith([{ kind: 'PAYMENT', amount: 600 }]),
      's1',
      1000,
    )
    expect(r).toEqual({ amountPaid: 600, creditAmount: 400 })
  })

  it('treats a fully-paid sale as zero credit', async () => {
    const service = makeService()
    const r = await service.recomputeSaleSettlement(
      mgrWith([
        { kind: 'PAYMENT', amount: 400 },
        { kind: 'PAYMENT', amount: 600 },
      ]),
      's1',
      1000,
    )
    expect(r).toEqual({ amountPaid: 1000, creditAmount: 0 })
  })

  it('subtracts REFUND rows from amountPaid and reopens credit', async () => {
    const service = makeService()
    const r = await service.recomputeSaleSettlement(
      mgrWith([
        { kind: 'PAYMENT', amount: 1000 },
        { kind: 'REFUND', amount: 300 },
      ]),
      's1',
      1000,
    )
    expect(r).toEqual({ amountPaid: 700, creditAmount: 300 })
  })

  it('clamps amountPaid at 0 when refunds exceed payments', async () => {
    const service = makeService()
    const r = await service.recomputeSaleSettlement(
      mgrWith([
        { kind: 'PAYMENT', amount: 500 },
        { kind: 'REFUND', amount: 800 },
      ]),
      's1',
      1000,
    )
    expect(r).toEqual({ amountPaid: 0, creditAmount: 1000 })
  })

  it('clamps credit at 0 on overpayment', async () => {
    const service = makeService()
    const r = await service.recomputeSaleSettlement(
      mgrWith([{ kind: 'PAYMENT', amount: 1200 }]),
      's1',
      1000,
    )
    expect(r).toEqual({ amountPaid: 1200, creditAmount: 0 })
  })

  it('defaults a row with no kind to PAYMENT', async () => {
    const service = makeService()
    const r = await service.recomputeSaleSettlement(mgrWith([{ amount: 250 }]), 's1', 1000)
    expect(r).toEqual({ amountPaid: 250, creditAmount: 750 })
  })
})
