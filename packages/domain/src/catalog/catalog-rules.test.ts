import { describe, expect, it } from 'vitest'
import { ProductType } from '@biztrack/types'
import {
  bundleCanMake,
  categoryAcceptsProducts,
  checkBundleComponents,
  checkProductKind,
  checkAttributeGroupRemoval,
  checkAttributeOptionRemoval,
  checkBrandRemoval,
  checkModelRemoval,
  checkCategoryRemoval,
  checkProductPrices,
  checkVariantCount,
  placeCategory,
  productStockFlags,
  validateSerialNumber,
} from './catalog-rules'

describe('productStockFlags (R13)', () => {
  it('follows the product type, and a simple product its own setting', () => {
    expect(productStockFlags(ProductType.SERVICE, true)).toEqual({
      isService: true,
      trackInventory: false,
    })
    expect(productStockFlags(ProductType.COMPOSITE, true).trackInventory).toBe(false)
    expect(productStockFlags(ProductType.VARIABLE_QUANTITY, false).trackInventory).toBe(true)
    expect(productStockFlags(ProductType.SIMPLE, false).trackInventory).toBe(false)
    expect(productStockFlags(ProductType.SIMPLE).trackInventory).toBe(true)
  })
})

describe('checkProductPrices (R15)', () => {
  it('allows zero and refuses a negative or non-number price or cost', () => {
    expect(checkProductPrices({ sellingPrice: 0 })).toBeNull()
    expect(checkProductPrices({ sellingPrice: 1000, costPrice: 600 })).toBeNull()
    expect(checkProductPrices({ sellingPrice: -1 })).toBe('PRODUCT_PRICE_INVALID')
    expect(checkProductPrices({ sellingPrice: Number.NaN })).toBe('PRODUCT_PRICE_INVALID')
    expect(checkProductPrices({ sellingPrice: 1000, costPrice: -5 })).toBe('PRODUCT_COST_INVALID')
  })
})

describe('checkVariantCount (R14)', () => {
  it('needs at least one variant', () => {
    expect(checkVariantCount(1)).toBeNull()
    expect(checkVariantCount(0)).toBe('PRODUCT_VARIANTS_REQUIRED')
  })
})

describe('placeCategory', () => {
  const parent = (
    over: Partial<{ depth: number; hasProducts: boolean; hasVariantOptions: boolean }> = {},
  ) => ({
    id: 'p',
    depth: 1,
    hasProducts: false,
    hasVariantOptions: false,
    ...over,
  })

  it('puts a new category at the top or one level under its parent', () => {
    expect(placeCategory({ nextParentId: null })).toEqual({
      ok: true,
      parentId: null,
      depth: 1,
      moved: true,
    })
    expect(placeCategory({ nextParentId: 'p', parent: parent({ depth: 2 }) })).toMatchObject({
      ok: true,
      depth: 3,
    })
  })

  it('refuses a fourth level, a parent with products or variant options, or a missing parent', () => {
    expect(placeCategory({ nextParentId: 'p', parent: parent({ depth: 3 }) })).toEqual({
      ok: false,
      code: 'MAX_DEPTH_EXCEEDED',
    })
    expect(placeCategory({ nextParentId: 'p', parent: parent({ hasProducts: true }) })).toEqual({
      ok: false,
      code: 'CATEGORY_PARENT_HAS_PRODUCTS',
    })
    expect(
      placeCategory({ nextParentId: 'p', parent: parent({ hasVariantOptions: true }) }),
    ).toEqual({ ok: false, code: 'CATEGORY_PARENT_HAS_VARIANT_OPTIONS' })
    expect(placeCategory({ nextParentId: 'p', parent: null })).toEqual({
      ok: false,
      code: 'CATEGORY_PARENT_NOT_FOUND',
    })
  })

  it('moves only a category with no sub-categories, and never under itself', () => {
    expect(
      placeCategory({
        selfId: 's',
        currentParentId: null,
        nextParentId: 'p',
        hasChildren: true,
        parent: parent(),
      }),
    ).toEqual({ ok: false, code: 'CATEGORY_REPARENT_HAS_CHILDREN' })
    expect(
      placeCategory({ selfId: 's', currentParentId: null, nextParentId: 's', parent: parent() }),
    ).toEqual({ ok: false, code: 'CATEGORY_PARENT_CYCLE' })
  })

  it('leaves a category that does not move where it is', () => {
    expect(
      placeCategory({
        selfId: 's',
        currentParentId: 'p',
        nextParentId: 'p',
        hasChildren: true,
        parent: parent({ hasProducts: true }),
      }),
    ).toEqual({ ok: true, parentId: 'p', depth: 2, moved: false })
  })
})

describe('category removal and products', () => {
  it('deletes only an empty category, and takes products only in a leaf', () => {
    expect(checkCategoryRemoval({ hasChildren: true, productCount: 0 })).toBe(
      'CATEGORY_HAS_CHILDREN',
    )
    expect(checkCategoryRemoval({ hasChildren: false, productCount: 2 })).toBe(
      'CATEGORY_HAS_PRODUCTS',
    )
    expect(checkCategoryRemoval({ hasChildren: false, productCount: 0 })).toBeNull()
    expect(categoryAcceptsProducts(0)).toBe(true)
    expect(categoryAcceptsProducts(1)).toBe(false)
  })
})

describe('validateSerialNumber', () => {
  it('checks each serial type', () => {
    expect(validateSerialNumber('490154203237518', 'IMEI')).toBe(true)
    expect(validateSerialNumber('490154203237519', 'IMEI')).toBe(false)
    expect(validateSerialNumber('SN-001_A', 'SERIAL_NUMBER')).toBe(true)
    expect(validateSerialNumber('SN 001', 'SERIAL_NUMBER')).toBe(false)
    expect(validateSerialNumber('any thing', 'BARCODE')).toBe(true)
    expect(validateSerialNumber('x', 'OTHER')).toBe(false)
  })
})

describe('brand, model and attribute removal', () => {
  it('refuses while products or variants use them', () => {
    expect(checkBrandRemoval(1)).toBe('BRAND_IN_USE')
    expect(checkBrandRemoval(0)).toBeNull()
    expect(checkModelRemoval(3)).toBe('MODEL_IN_USE')
    expect(checkModelRemoval(0)).toBeNull()
    expect(checkAttributeOptionRemoval(1)).toBe('ATTRIBUTE_OPTION_IN_USE')
    expect(checkAttributeOptionRemoval(0)).toBeNull()
  })

  it('says whether variants or category links hold an attribute', () => {
    expect(checkAttributeGroupRemoval({ variantUses: 1, categoryLinks: 1 })).toEqual({
      code: 'ATTRIBUTE_GROUP_IN_USE',
      cause: 'VARIANTS',
    })
    expect(checkAttributeGroupRemoval({ variantUses: 0, categoryLinks: 2 })).toEqual({
      code: 'ATTRIBUTE_GROUP_IN_USE',
      cause: 'CATEGORIES',
    })
    expect(checkAttributeGroupRemoval({ variantUses: 0, categoryLinks: 0 })).toBeNull()
  })
})

describe('checkProductKind', () => {
  it('allows variants only on simple and sold-by-quantity products', () => {
    expect(checkProductKind({ productType: 'SIMPLE', hasVariants: true })).toBeNull()
    expect(checkProductKind({ productType: 'VARIABLE_QUANTITY', hasVariants: true })).toBeNull()
    expect(checkProductKind({ productType: 'SERVICE', hasVariants: true })).toBe(
      'VARIANTS_NOT_SUPPORTED',
    )
    expect(checkProductKind({ productType: 'COMPOSITE', hasVariants: true })).toBe(
      'VARIANTS_NOT_SUPPORTED',
    )
  })

  it('allows serial numbers only on a simple product with a valid serial type', () => {
    expect(
      checkProductKind({ productType: 'SIMPLE', isSerialized: true, serialType: 'IMEI' }),
    ).toBeNull()
    expect(
      checkProductKind({ productType: 'SERVICE', isSerialized: true, serialType: 'IMEI' }),
    ).toBe('SERIALIZED_ONLY_SIMPLE')
    expect(checkProductKind({ productType: 'SIMPLE', isSerialized: true })).toBe(
      'SERIAL_TYPE_REQUIRED',
    )
    expect(
      checkProductKind({ productType: 'SIMPLE', isSerialized: true, serialType: 'RFID' }),
    ).toBe('SERIAL_TYPE_INVALID')
  })
})

describe('bundles', () => {
  it('needs components, all found, none a bundle', () => {
    expect(checkBundleComponents({ requested: 0, found: [] })).toBe('BUNDLE_COMPONENTS_REQUIRED')
    expect(checkBundleComponents({ requested: 2, found: [{ productType: 'SIMPLE' }] })).toBe(
      'PRODUCT_NOT_FOUND',
    )
    expect(
      checkBundleComponents({
        requested: 2,
        found: [{ productType: 'SIMPLE' }, { productType: 'COMPOSITE' }],
      }),
    ).toBe('BUNDLE_COMPONENT_NESTED')
    expect(checkBundleComponents({ requested: 1, found: [{ productType: 'SIMPLE' }] })).toBeNull()
  })

  it('makes as many bundles as the scarcest component allows', () => {
    expect(
      bundleCanMake([
        { name: 'Rice', inStock: 10, requiredPerBundle: 2 },
        { name: 'Oil', inStock: 3, requiredPerBundle: 1 },
      ]),
    ).toEqual({ canMake: 3, limitedBy: null })
    expect(bundleCanMake([{ name: 'Oil', inStock: 1, requiredPerBundle: 2 }])).toEqual({
      canMake: 0,
      limitedBy: 'Oil',
    })
    expect(bundleCanMake([])).toEqual({ canMake: 0, limitedBy: null })
  })
})
