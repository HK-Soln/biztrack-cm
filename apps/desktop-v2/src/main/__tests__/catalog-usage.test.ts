import { beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseService } from '@biztrack/electron-core'
import { createTestDatabase } from '@biztrack/electron-core/testing'
import { AttributesService } from '../services/attributes.service'
import { BrandsService } from '../services/brands.service'

// Ruling R12: brands, models and attributes are deleted on the till by the server's rules
// (@biztrack/domain): only once nothing uses them, and a brand takes its models and
// category links with it, an attribute its options.

const BIZ = 'biz-1'
const NOW = '2026-10-16T08:00:00.000Z'

describe('removing brands, models and attributes on the till (R12)', () => {
  let db: DatabaseService
  let brands: BrandsService
  let attributes: AttributesService

  beforeEach(() => {
    db = createTestDatabase()
    brands = new BrandsService(
      db,
      () => BIZ,
      () => {},
    )
    attributes = new AttributesService(
      db,
      () => BIZ,
      () => {},
    )
    db.run(
      `INSERT INTO product_categories (id, business_id, name, slug, depth, is_active, is_deleted, created_at, updated_at)
       VALUES ('cat-1', ?, 'Phones', 'phones', 1, 1, 0, ?, ?)`,
      [BIZ, NOW, NOW],
    )
  })

  const deleted = (table: string, where: string, params: unknown[]) =>
    db.query<{ is_deleted: number }>(`SELECT is_deleted FROM ${table} WHERE ${where}`, params)

  it('refuses to delete a brand or model a product uses', () => {
    const brand = brands.create({ name: 'Tecno', categoryIds: ['cat-1'] })
    const model = brands.addModel(brand.id, { name: 'Spark 10' })
    db.run(
      `INSERT INTO products (id, business_id, name, price, brand_id, model_id, created_at, updated_at)
       VALUES ('p-1', ?, 'Spark 10 128GB', 90000, ?, ?, ?, ?)`,
      [BIZ, brand.id, model.id, NOW, NOW],
    )
    expect(() => brands.removeModel(model.id)).toThrow('still used')
    expect(() => brands.remove(brand.id)).toThrow('still used')
  })

  it('deletes a brand with its models and category links', () => {
    const brand = brands.create({ name: 'Tecno', categoryIds: ['cat-1'] })
    brands.addModel(brand.id, { name: 'Spark 10' })

    brands.remove(brand.id)

    expect(deleted('models', 'brand_id = ?', [brand.id])).toEqual([{ is_deleted: 1 }])
    expect(deleted('brand_categories', 'brand_id = ?', [brand.id])).toEqual([{ is_deleted: 1 }])
  })

  it('deletes an attribute with its options, but not one a category is linked to', () => {
    const colour = attributes.createGroup({ name: 'Colour' })
    attributes.addOption(colour.id, { value: 'Red' })
    attributes.addOption(colour.id, { value: 'Blue' })

    attributes.deleteGroup(colour.id)
    expect(deleted('attribute_options', 'group_id = ?', [colour.id])).toEqual([
      { is_deleted: 1 },
      { is_deleted: 1 },
    ])

    const size = attributes.createGroup({ name: 'Size' })
    db.run(
      `INSERT INTO category_attribute_groups (id, business_id, category_id, attribute_group_id, created_at, updated_at)
       VALUES ('link-1', ?, 'cat-1', ?, ?, ?)`,
      [BIZ, size.id, NOW, NOW],
    )
    expect(() => attributes.deleteGroup(size.id)).toThrow('linked to one or more categories')
  })
})
