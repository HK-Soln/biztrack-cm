import { beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseService } from '@biztrack/electron-core'
import { createTestDatabase } from '@biztrack/electron-core/testing'
import { ProductsService } from '../services/products.service'

// A product's SKU on the till follows the rules the server applies when the product syncs
// (@biztrack/domain checkProductSku): stored in capitals, letters, digits, - and _ only,
// unique in the business, and fixed once set. Before, the till saved an edited SKU and the
// server rejected the product on sync.

const BIZ = 'biz-1'
const NOW = '2026-08-28T12:00:00.000Z'

describe('product SKU on the till', () => {
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

  const create = (sku?: string, name = 'Widget') =>
    products.create({ name, sellingPrice: 1000, unitOfMeasureId: 'u1', sku } as never)

  it('stores the SKU in capitals and refuses a bad shape', () => {
    expect(create(' ab-12_c ').sku).toBe('AB-12_C')
    expect(() => create('AB 12', 'Other')).toThrow('letters, digits')
  })

  it('refuses a SKU another product already uses', () => {
    create('AB-12')
    expect(() => create('ab-12', 'Other')).toThrow('already uses this SKU')
  })

  it('keeps the SKU once set, and lets one be added to a product without', () => {
    const withSku = create('AB-12')
    const input = { name: 'Widget', sellingPrice: 1200, unitOfMeasureId: 'u1' } as never
    expect(products.update(withSku.id, { ...(input as object), sku: 'ab-12' } as never).sku).toBe(
      'AB-12',
    )
    expect(() =>
      products.update(withSku.id, { ...(input as object), sku: 'XY-1' } as never),
    ).toThrow('cannot be changed')
  })

  it('gives a product created without a SKU one, made the way the server makes it', () => {
    expect(create(undefined, 'Plain').sku).toMatch(/^GEN-[A-Z0-9]{1,6}-[A-Z0-9]{4}$/)
  })

  it('takes any text as a barcode, and refuses one another product uses', () => {
    const first = products.create({
      name: 'Shelf item',
      sellingPrice: 1000,
      unitOfMeasureId: 'u1',
      barcode: '  SHELF 12  ',
    } as never)
    expect(first.barcode).toBe('SHELF 12')
    expect(() =>
      products.create({
        name: 'Other',
        sellingPrice: 1000,
        unitOfMeasureId: 'u1',
        barcode: 'SHELF 12',
      } as never),
    ).toThrow('already uses this barcode')
  })

  // Ruling R12: the slug is the one the server gives (@biztrack/domain uniqueSlug).
  it('makes the slug the server would: punctuation dropped, numbered when taken', () => {
    const slug = (id: string) =>
      db.get<{ slug: string }>(`SELECT slug FROM products WHERE id = ?`, [id])!.slug
    const first = create(undefined, 'Café/Bar')
    const second = create(undefined, 'cafébar')
    expect(slug(first.id)).toBe('cafebar')
    expect(slug(second.id)).toBe('cafebar-2')
    products.update(first.id, {
      name: 'Café/Bar',
      sellingPrice: 1000,
      unitOfMeasureId: 'u1',
    } as never)
    expect(slug(first.id)).toBe('cafebar')
  })

  it('stores a variant SKU trimmed, a blank one as none, and refuses a taken one', () => {
    const shirt = create(undefined, 'Shirt')
    const red = products.addVariant(shirt.id, {
      name: 'Red',
      sku: ' TS-RED ',
      options: [],
    } as never)
    const blue = products.addVariant(shirt.id, { name: 'Blue', sku: '  ', options: [] } as never)
    const skuOf = (id: string) =>
      db.get<{ sku: string | null }>(`SELECT sku FROM product_variants WHERE id = ?`, [id])!.sku
    expect(skuOf(red.id)).toBe('TS-RED')
    expect(skuOf(blue.id)).toBeNull()
    expect(() =>
      products.addVariant(shirt.id, { name: 'Green', sku: 'TS-RED', options: [] } as never),
    ).toThrow('already used by another variant')
  })
})
