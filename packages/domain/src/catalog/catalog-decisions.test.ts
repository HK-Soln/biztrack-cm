import { describe, expect, it } from 'vitest'
import { planAttributeGroupRemoval, planBrandRemoval, productKindToStore } from './catalog-rules'
import { findVariantSkuClash } from './product-codes'

describe('productKindToStore', () => {
  const phone = { productType: 'SIMPLE' as const, isSerialized: true, serialType: 'IMEI' }

  it('takes what is asked for a new product', () => {
    expect(productKindToStore(null, phone)).toEqual({ ...phone, changedIgnored: false })
  })

  it('keeps an existing product’s type and serial setting', () => {
    expect(
      productKindToStore(phone, { productType: 'SIMPLE', isSerialized: false, serialType: null }),
    ).toEqual({ ...phone, changedIgnored: true })
    expect(productKindToStore(phone, phone).changedIgnored).toBe(false)
  })
})

describe('removal plans', () => {
  it('lists the brand, its models and its category links, or refuses', () => {
    expect(
      planBrandRemoval({ brandId: 'b', productCount: 0, modelIds: ['m'], categoryLinkIds: ['l'] }),
    ).toEqual({ ok: true, brandIds: ['b'], modelIds: ['m'], categoryLinkIds: ['l'] })
    expect(
      planBrandRemoval({ brandId: 'b', productCount: 1, modelIds: [], categoryLinkIds: [] }),
    ).toEqual({ ok: false, code: 'BRAND_IN_USE' })
  })

  it('lists the attribute and its options, or says what holds it', () => {
    expect(
      planAttributeGroupRemoval({
        groupId: 'g',
        variantUses: 0,
        categoryLinks: 0,
        optionIds: ['o1', 'o2'],
      }),
    ).toEqual({ ok: true, groupIds: ['g'], optionIds: ['o1', 'o2'] })
    expect(
      planAttributeGroupRemoval({ groupId: 'g', variantUses: 0, categoryLinks: 1, optionIds: [] }),
    ).toEqual({ ok: false, code: 'ATTRIBUTE_GROUP_IN_USE', cause: 'CATEGORIES' })
  })
})

describe('findVariantSkuClash', () => {
  it('finds a SKU given twice, or held by another live variant', () => {
    expect(findVariantSkuClash([{ sku: 'A' }, { sku: ' A ' }], [])).toEqual({
      code: 'VARIANT_DUPLICATE_SKU',
      sku: 'A',
      within: true,
    })
    expect(findVariantSkuClash([{ sku: 'A' }], [{ id: 'other', sku: 'A' }])).toEqual({
      code: 'VARIANT_DUPLICATE_SKU',
      sku: 'A',
      within: false,
    })
  })

  it('lets a variant keep its SKU, and two variants swap theirs', () => {
    expect(findVariantSkuClash([{ id: 'v1', sku: 'A' }], [{ id: 'v1', sku: 'A' }])).toBeNull()
    expect(
      findVariantSkuClash(
        [
          { id: 'v1', sku: 'B' },
          { id: 'v2', sku: 'A' },
        ],
        [
          { id: 'v1', sku: 'A' },
          { id: 'v2', sku: 'B' },
        ],
      ),
    ).toBeNull()
    expect(findVariantSkuClash([{ sku: null }, { sku: '' }], [])).toBeNull()
  })
})
