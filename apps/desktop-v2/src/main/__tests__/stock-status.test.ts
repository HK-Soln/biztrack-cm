import { beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseService } from '@biztrack/electron-core'
import { createTestDatabase } from '@biztrack/electron-core/testing'
import { ProductsService } from '../services/products.service'

// Slice 9: the till judges stock by @biztrack/domain productStockStatus, as the server does.
// A product with variants is low once one variant is out or low; a serialized product's
// stock is its in-stock units.

const BIZ = 'biz-1'
const NOW = '2026-10-16T12:00:00.000Z'

describe('stock status on the till', () => {
  let db: DatabaseService
  let products: ProductsService

  beforeEach(() => {
    db = createTestDatabase()
    db.run(
      `INSERT INTO unit_of_measures (id, business_id, name, abbreviation, type, is_default, is_active, is_deleted, created_at, updated_at)
       VALUES ('u1', ?, 'Piece', 'pc', 'QUANTITY', 1, 1, 0, ?, ?)`,
      [BIZ, NOW, NOW],
    )
    products = new ProductsService(
      db,
      () => BIZ,
      () => {},
    )
  })

  const product = (name: string, extra: Record<string, unknown> = {}) =>
    products.create({ name, sellingPrice: 1000, unitOfMeasureId: 'u1', ...extra } as never)
  const variant = (productId: string, name: string, stock: number) =>
    db.run(
      `INSERT INTO product_variants (id, business_id, product_id, name, stock_quantity, is_deleted, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      [`${productId}-${name}`, BIZ, productId, name, stock, NOW, NOW],
    )

  it('marks a product with an empty variant as low', () => {
    const shirt = product('Shirt')
    variant(shirt.id, 'M', 5)
    variant(shirt.id, 'S', 0)
    const full = product('Cap')
    variant(full.id, 'One size', 4)

    expect(products.getOne(shirt.id)).toMatchObject({ currentStock: 5, stockStatus: 'low' })
    expect(products.getOne(full.id)?.stockStatus).toBe('in')
    expect(products.list({ stockStatus: 'low' }).data.map((p) => p.id)).toEqual([shirt.id])
    expect(products.stats()).toMatchObject({ lowStock: 1 })
  })

  it("counts a serialized product's units", () => {
    const phone = product('Phone', { isSerialized: true, serialType: 'SERIAL_NUMBER' })
    expect(products.getOne(phone.id)?.stockStatus).toBe('out')
    products.addSerialUnits(phone.id, [{ serialNumber: 'SN-1', serialType: 'SERIAL_NUMBER' }])
    expect(products.getOne(phone.id)).toMatchObject({ currentStock: 1, stockStatus: 'in' })
  })
})
