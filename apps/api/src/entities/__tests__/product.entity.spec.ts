/// <reference types="jest" />
import { ProductType } from '@biztrack/types'
import { Product } from '../product.entity'

const sync = (overrides: Partial<Product>) => {
  const product = new Product()
  Object.assign(product, overrides)
  product.syncDerivedFields()
  return product
}

describe('Product.syncDerivedFields', () => {
  it('SERVICE → isService true, trackInventory false', () => {
    const p = sync({ productType: ProductType.SERVICE })
    expect(p.isService).toBe(true)
    expect(p.trackInventory).toBe(false)
  })

  it('SIMPLE → not a service, tracked by default', () => {
    const p = sync({ productType: ProductType.SIMPLE })
    expect(p.isService).toBe(false)
    expect(p.trackInventory).toBe(true)
  })

  it('SIMPLE preserves an explicit trackInventory=false (physical-but-untracked)', () => {
    const p = sync({ productType: ProductType.SIMPLE, trackInventory: false })
    expect(p.isService).toBe(false)
    expect(p.trackInventory).toBe(false)
  })

  it('VARIABLE_QUANTITY → tracked', () => {
    const p = sync({ productType: ProductType.VARIABLE_QUANTITY, trackInventory: false })
    expect(p.isService).toBe(false)
    expect(p.trackInventory).toBe(true) // VARIABLE_QUANTITY always tracks; ignores the explicit false
  })

  it('COMPOSITE → no service, no stock', () => {
    const p = sync({ productType: ProductType.COMPOSITE, trackInventory: true })
    expect(p.isService).toBe(false)
    expect(p.trackInventory).toBe(false)
  })

  it('infers productType from legacy isService when productType is unset', () => {
    const fromService = sync({ isService: true } as Partial<Product>)
    expect(fromService.productType).toBe(ProductType.SERVICE)
    expect(fromService.trackInventory).toBe(false)

    const fromPhysical = sync({ isService: false } as Partial<Product>)
    expect(fromPhysical.productType).toBe(ProductType.SIMPLE)
    expect(fromPhysical.isService).toBe(false)
  })
})
