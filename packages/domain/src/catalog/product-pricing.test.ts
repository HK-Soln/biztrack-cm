import { describe, expect, it } from 'vitest'
import {
  checkProductSku,
  marginPercent,
  normalizeProductSku,
  productAverageCost,
  productDisplayPrice,
  stockStatus,
  variantCost,
  variantPrice,
} from './product-pricing'

const product = { sellingPrice: 5000, costPrice: 3000 }

describe('variant price and cost', () => {
  it('uses the variant’s own price and cost, else the product’s', () => {
    expect(variantPrice(product, { priceOverride: 5500 })).toBe(5500)
    expect(variantPrice(product, { priceOverride: null })).toBe(5000)
    expect(variantPrice(product)).toBe(5000)
    expect(variantCost(product, { costPriceOverride: 3500 })).toBe(3500)
    expect(variantCost(product, {})).toBe(3000)
    expect(variantCost({ sellingPrice: 5000, costPrice: null }, {})).toBeNull()
  })
})

describe('productDisplayPrice and productAverageCost', () => {
  const variants = [
    { priceOverride: 6000, costPriceOverride: 4000 },
    { priceOverride: null, costPriceOverride: null },
  ]
  it('shows a variant product from its cheapest variant', () => {
    expect(productDisplayPrice(product, variants)).toBe(5000)
    expect(productDisplayPrice(product)).toBe(5000)
  })
  it('averages the variant costs, leaving out a variant with no cost', () => {
    expect(productAverageCost(product, variants)).toBe(3500)
    const noProductCost = { sellingPrice: 5000, costPrice: null }
    expect(productAverageCost(noProductCost, variants)).toBe(4000)
    expect(productAverageCost(noProductCost, [{}])).toBeNull()
  })
})

describe('marginPercent', () => {
  it('is the margin on the price, one decimal, and unknown without a price or cost', () => {
    expect(marginPercent(3000, 2000)).toBe(33.3)
    expect(marginPercent(3000, null)).toBeNull()
    expect(marginPercent(3000, 0)).toBeNull()
    expect(marginPercent(0, 2000)).toBeNull()
    expect(marginPercent(2000, 3000)).toBe(-50)
  })
})

describe('stockStatus', () => {
  it('is out at zero, low at or under the reorder point, else in', () => {
    expect(stockStatus({ stock: 0, reorderPoint: 5 })).toBe('OUT')
    expect(stockStatus({ stock: 5, reorderPoint: 5, lowStockThreshold: 10 })).toBe('LOW')
    expect(stockStatus({ stock: 8, lowStockThreshold: 10 })).toBe('LOW')
    expect(stockStatus({ stock: 8, reorderPoint: 5, lowStockThreshold: 10 })).toBe('IN')
    expect(stockStatus({ stock: 1 })).toBe('IN')
  })
})

describe('product SKU', () => {
  it('is stored trimmed and in capitals', () => {
    expect(normalizeProductSku('  abc-12 ')).toBe('ABC-12')
    expect(normalizeProductSku('   ')).toBeNull()
  })
  it('must have the right shape when first given', () => {
    expect(checkProductSku({ incoming: 'abc-12' })).toEqual({ ok: true, sku: 'ABC-12' })
    expect(checkProductSku({ incoming: 'AB C' })).toEqual({
      ok: false,
      code: 'PRODUCT_SKU_INVALID',
    })
    expect(checkProductSku({ incoming: null })).toEqual({ ok: true, sku: null })
  })
  it('cannot change once set, and keeps the existing one when none is sent', () => {
    expect(checkProductSku({ existing: 'ABC-12', incoming: 'abc-12' })).toEqual({
      ok: true,
      sku: 'ABC-12',
    })
    expect(checkProductSku({ existing: 'ABC-12', incoming: 'XYZ' })).toEqual({
      ok: false,
      code: 'PRODUCT_SKU_IMMUTABLE',
    })
    expect(checkProductSku({ existing: 'ABC-12', incoming: '' })).toEqual({
      ok: true,
      sku: 'ABC-12',
    })
  })
})
