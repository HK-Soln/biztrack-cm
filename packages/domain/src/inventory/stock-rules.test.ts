import { describe, expect, it } from 'vitest'
import {
  checkStockAdjustmentTarget,
  decideStockAdjustment,
  newProductStockLevel,
  newVariantStockLevel,
  planProductRemoval,
  planVariantRemoval,
  previewStockAdjustment,
  productStockStatus,
  productStockStatusSql,
  saleStockLines,
  stockChangeMovementType,
  stockLevelOnEdit,
  stockStatusSql,
  type StockedProduct,
} from './stock-rules'

describe('decideStockAdjustment', () => {
  it('adds, removes and sets', () => {
    expect(
      decideStockAdjustment({ current: 5, type: 'ADD', quantity: 3, notes: ' count ' }),
    ).toEqual({
      ok: true,
      before: 5,
      after: 8,
      change: 3,
      notes: 'count',
    })
    expect(
      decideStockAdjustment({ current: 5, type: 'REMOVE', quantity: 2, notes: 'broken' }),
    ).toMatchObject({
      after: 3,
      change: -2,
    })
    expect(
      decideStockAdjustment({ current: 5, type: 'SET', quantity: 0, notes: 'count' }),
    ).toMatchObject({
      after: 0,
      change: -5,
    })
  })

  it('keeps three decimals', () => {
    expect(
      decideStockAdjustment({ current: 0.1, type: 'ADD', quantity: 0.2, notes: 'weigh' }),
    ).toMatchObject({ after: 0.3, change: 0.2 })
  })

  it('reports a SET to the current level as no change', () => {
    expect(
      decideStockAdjustment({ current: 4, type: 'SET', quantity: 4, notes: 'count' }),
    ).toMatchObject({
      ok: true,
      change: 0,
    })
  })

  it('refuses in order: quantity, stock, reason', () => {
    expect(decideStockAdjustment({ current: 5, type: 'ADD', quantity: 0, notes: '' })).toEqual({
      ok: false,
      code: 'STOCK_QUANTITY_NOT_POSITIVE',
    })
    expect(decideStockAdjustment({ current: 5, type: 'SET', quantity: -1, notes: 'x' })).toEqual({
      ok: false,
      code: 'STOCK_QUANTITY_NEGATIVE',
    })
    expect(decideStockAdjustment({ current: 5, type: 'REMOVE', quantity: 6, notes: '' })).toEqual({
      ok: false,
      code: 'INVENTORY_INSUFFICIENT_STOCK',
    })
    expect(decideStockAdjustment({ current: 5, type: 'ADD', quantity: 1, notes: '  ab ' })).toEqual(
      {
        ok: false,
        code: 'STOCK_REASON_REQUIRED',
      },
    )
    expect(decideStockAdjustment({ current: 5, type: 'ADD', quantity: NaN, notes: 'abc' })).toEqual(
      {
        ok: false,
        code: 'STOCK_QUANTITY_INVALID',
      },
    )
  })

  it('previews the level without checks', () => {
    expect(previewStockAdjustment({ current: 2, type: 'REMOVE', quantity: 5 })).toBe(-3)
  })
})

describe('stockChangeMovementType', () => {
  it('makes the first positive change the opening stock', () => {
    expect(stockChangeMovementType({ change: 3, hasHistory: false })).toBe('OPENING_STOCK')
    expect(stockChangeMovementType({ change: 3, hasHistory: true })).toBe('MANUAL_ADJUSTMENT')
    expect(stockChangeMovementType({ change: -1, hasHistory: false })).toBe('MANUAL_ADJUSTMENT')
  })
})

describe('checkStockAdjustmentTarget', () => {
  const base = { trackInventory: true, isSerialized: false, hasVariants: false }
  it('adjusts a direct product, or a variant of a variant product', () => {
    expect(checkStockAdjustmentTarget(base)).toBeNull()
    expect(checkStockAdjustmentTarget({ ...base, hasVariants: true, variantId: 'v' })).toBeNull()
  })
  it('refuses the rest', () => {
    expect(checkStockAdjustmentTarget({ ...base, trackInventory: false })).toBe('STOCK_NOT_TRACKED')
    expect(checkStockAdjustmentTarget({ ...base, isSerialized: true })).toBe('STOCK_SERIALIZED')
    expect(checkStockAdjustmentTarget({ ...base, hasVariants: true })).toBe(
      'STOCK_VARIANT_REQUIRED',
    )
    expect(checkStockAdjustmentTarget({ ...base, variantId: 'v' })).toBe(
      'STOCK_VARIANT_NOT_EXPECTED',
    )
  })
})

describe('newProductStockLevel', () => {
  it('starts a tracked product at its opening stock, never below zero', () => {
    expect(
      newProductStockLevel({ trackInventory: true, isSerialized: false, openingStock: 4 }),
    ).toEqual({
      quantity: 4,
    })
    expect(
      newProductStockLevel({ trackInventory: true, isSerialized: false, openingStock: -2 }),
    ).toEqual({
      quantity: 0,
    })
  })
  it('keeps a serialized product at 0, its stock being its units', () => {
    expect(
      newProductStockLevel({ trackInventory: true, isSerialized: true, openingStock: 3 }),
    ).toEqual({
      quantity: 0,
    })
  })
  it('gives an untracked product none', () => {
    expect(newProductStockLevel({ trackInventory: false, isSerialized: false })).toBeNull()
  })
})

describe('stockLevelOnEdit', () => {
  it('creates, keeps or removes the level with tracking', () => {
    expect(stockLevelOnEdit({ trackInventory: true, hasLevel: false })).toBe('CREATE')
    expect(stockLevelOnEdit({ trackInventory: true, hasLevel: true })).toBe('KEEP')
    expect(stockLevelOnEdit({ trackInventory: false, hasLevel: true })).toBe('REMOVE')
    expect(stockLevelOnEdit({ trackInventory: false, hasLevel: false })).toBe('NONE')
  })
})

describe('newVariantStockLevel', () => {
  it('starts a variant at its opening stock unless serialized or untracked', () => {
    expect(
      newVariantStockLevel({ trackInventory: true, isSerialized: false, openingStock: -1 }),
    ).toEqual({
      quantity: 0,
    })
    expect(
      newVariantStockLevel({ trackInventory: true, isSerialized: true, openingStock: 2 }),
    ).toBeNull()
    expect(newVariantStockLevel({ trackInventory: false, isSerialized: false })).toBeNull()
  })
})

describe('productStockStatus', () => {
  it('judges a product without variants on its own level', () => {
    expect(productStockStatus({ stock: 0 })).toBe('OUT')
    expect(productStockStatus({ stock: 3, reorderPoint: 5, lowStockThreshold: 1 })).toBe('LOW')
    expect(productStockStatus({ stock: 3, lowStockThreshold: 2 })).toBe('IN')
  })
  it('is low when any variant is out or low, out when they hold nothing', () => {
    expect(productStockStatus({ stock: 9, variants: [{ stock: 9 }, { stock: 0 }] })).toBe('LOW')
    expect(
      productStockStatus({
        stock: 9,
        variants: [{ stock: 5 }, { stock: 4, lowStockThreshold: 4 }],
      }),
    ).toBe('LOW')
    expect(productStockStatus({ stock: 9, variants: [{ stock: 5 }, { stock: 4 }] })).toBe('IN')
    expect(productStockStatus({ stock: 0, variants: [{ stock: 0 }, { stock: 0 }] })).toBe('OUT')
  })
})

describe('stockStatusSql', () => {
  it('writes the same rule as a CASE expression', () => {
    expect(stockStatusSql('s', 'rp', 'lt')).toBe(
      "(CASE WHEN s <= 0 THEN 'OUT' WHEN COALESCE(rp, lt, 0) > 0 AND s <= COALESCE(rp, lt, 0) THEN 'LOW' ELSE 'IN' END)",
    )
    expect(
      productStockStatusSql({
        stock: 's',
        reorderPoint: 'rp',
        lowStockThreshold: 'lt',
        hasVariants: 'hv',
        anyVariantShort: 'short',
      }),
    ).toContain("WHEN hv THEN (CASE WHEN s <= 0 THEN 'OUT' WHEN short THEN 'LOW' ELSE 'IN' END)")
  })
})

describe('saleStockLines', () => {
  const products: Record<string, StockedProduct> = {
    rice: { productType: 'SIMPLE', trackInventory: true, isSerialized: false },
    oil: { productType: 'SIMPLE', trackInventory: true, isSerialized: false },
    phone: { productType: 'SIMPLE', trackInventory: true, isSerialized: true },
    service: { productType: 'SERVICE', trackInventory: false, isSerialized: false },
    basket: { productType: 'COMPOSITE', trackInventory: false, isSerialized: false },
  }
  const catalog = {
    product: (id: string) => products[id],
    components: (id: string) =>
      id === 'basket'
        ? [
            { componentProductId: 'rice', quantity: 2 },
            { componentProductId: 'oil', quantity: 0.5 },
            { componentProductId: 'service', quantity: 1 },
          ]
        : [],
  }

  it('takes a bundle from its components and skips units and services', () => {
    expect(
      saleStockLines(
        [
          { productId: 'basket', quantity: 3, tag: 'b' },
          { productId: 'rice', variantId: null, quantity: 1, tag: 'r' },
          { productId: 'phone', quantity: 1, tag: 'p' },
          { productId: 'service', quantity: 1, tag: 's' },
        ],
        catalog,
      ),
    ).toEqual([
      { productId: 'rice', variantId: null, quantity: 6, tag: 'b' },
      { productId: 'oil', variantId: null, quantity: 1.5, tag: 'b' },
      { productId: 'rice', variantId: null, quantity: 1, tag: 'r' },
    ])
  })
})

describe('removal plans', () => {
  it('writes off what a deleted product holds', () => {
    expect(planProductRemoval({ stock: 4 })).toMatchObject({ writeOff: 4, serialStatus: 'DAMAGED' })
    expect(planProductRemoval({ stock: -1 }).writeOff).toBe(0)
  })
  it('needs a reason to remove a variant', () => {
    expect(planVariantRemoval({ reason: ' ', stock: 2 })).toEqual({
      ok: false,
      code: 'VARIANT_REMOVE_REASON_REQUIRED',
    })
    expect(planVariantRemoval({ reason: ' discontinued ', stock: 2 })).toMatchObject({
      ok: true,
      reason: 'discontinued',
      writeOff: 2,
    })
  })
})
