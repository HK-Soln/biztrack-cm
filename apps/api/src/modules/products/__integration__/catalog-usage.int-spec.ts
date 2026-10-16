import { randomUUID } from 'crypto'
import type { DataSource } from 'typeorm'
import { AttributeGroup } from '@/entities/attribute-group.entity'
import { AttributeOption } from '@/entities/attribute-option.entity'
import { BrandCategory } from '@/entities/brand-category.entity'
import { Brand } from '@/entities/brand.entity'
import { CategoryAttributeGroup } from '@/entities/category-attribute-group.entity'
import { Model } from '@/entities/model.entity'
import { ProductCategory } from '@/entities/product-category.entity'
import {
  applyAttributeGroupRemoval,
  applyBrandRemoval,
  decideAttributeOptionRemoval,
  decideModelRemoval,
  loadAttributeGroupRemovalPlan,
  loadBrandRemovalPlan,
} from '@/modules/products/catalog-usage'
import {
  closeIntegrationDataSource,
  getIntegrationDataSource,
} from '@/testing/integration-database'
import { createSalesSyncHarness, type SalesSyncHarness } from '@/testing/sales-sync-harness'

// Brands, models and attributes are deleted only once nothing uses them; a brand takes its
// models and category links, an attribute its options. The server's endpoints and deletes
// arriving by sync from a till both run these (ruling R12); before, a delete from a till
// skipped the checks and left the models and options behind.

describe('brand, model and attribute removal', () => {
  let dataSource: DataSource
  let h: SalesSyncHarness

  beforeAll(async () => {
    dataSource = await getIntegrationDataSource()
  })
  afterAll(async () => {
    await closeIntegrationDataSource()
  })
  beforeEach(async () => {
    h = await createSalesSyncHarness(dataSource)
  })

  const at = new Date('2026-10-16T10:00:00.000Z')
  const tag = () => randomUUID().slice(0, 8)

  const seedCategory = () =>
    dataSource.getRepository(ProductCategory).save(
      dataSource.getRepository(ProductCategory).create({
        businessId: h.businessId,
        name: `Phones ${tag()}`,
        slug: `phones-${tag()}`,
      }),
    )
  const seedBrand = async () => {
    const category = await seedCategory()
    const brand = await dataSource
      .getRepository(Brand)
      .save(
        dataSource
          .getRepository(Brand)
          .create({ businessId: h.businessId, name: `Tecno ${tag()}`, slug: `tecno-${tag()}` }),
      )
    await dataSource
      .getRepository(BrandCategory)
      .save(
        dataSource
          .getRepository(BrandCategory)
          .create({ businessId: h.businessId, brandId: brand.id, categoryId: category.id }),
      )
    const model = await dataSource
      .getRepository(Model)
      .save(
        dataSource
          .getRepository(Model)
          .create({ businessId: h.businessId, brandId: brand.id, name: 'Spark 10' }),
      )
    return { brand, model, category }
  }

  it('refuses a brand or model a product uses, and allows it once unused', async () => {
    const { brand, model } = await seedBrand()
    const product = await h.seedProduct({ price: 90000, stock: 0 })
    await dataSource.query(`UPDATE products SET brand_id = $1, model_id = $2 WHERE id = $3`, [
      brand.id,
      model.id,
      product,
    ])

    expect(await loadBrandRemovalPlan(dataSource.manager, h.businessId, brand.id)).toEqual({
      ok: false,
      code: 'BRAND_IN_USE',
    })
    expect(await decideModelRemoval(dataSource.manager, h.businessId, model.id)).toBe(
      'MODEL_IN_USE',
    )

    await dataSource.query(`UPDATE products SET deleted_at = now() WHERE id = $1`, [product])
    expect((await loadBrandRemovalPlan(dataSource.manager, h.businessId, brand.id)).ok).toBe(true)
    expect(await decideModelRemoval(dataSource.manager, h.businessId, model.id)).toBeNull()
  })

  it('deletes a brand with its models and category links', async () => {
    const { brand } = await seedBrand()

    const plan = await loadBrandRemovalPlan(dataSource.manager, h.businessId, brand.id)
    if (!plan.ok) throw new Error('expected a removable brand')
    expect(plan.modelIds).toHaveLength(1)
    expect(plan.categoryLinkIds).toHaveLength(1)
    await dataSource.transaction((m) => applyBrandRemoval(m, h.businessId, plan, at))

    const rows = (await dataSource.query(
      `SELECT
         (SELECT deleted_at IS NOT NULL FROM brands WHERE id = $1) AS brand,
         (SELECT bool_and(deleted_at IS NOT NULL) FROM models WHERE brand_id = $1) AS models,
         (SELECT bool_and(deleted_at IS NOT NULL) FROM brand_categories WHERE brand_id = $1) AS links`,
      [brand.id],
    )) as Array<{ brand: boolean; models: boolean; links: boolean }>
    expect(rows[0]).toEqual({ brand: true, models: true, links: true })
  })

  it('refuses an attribute linked to a category; deletes an unused one with its options', async () => {
    const groups = dataSource.getRepository(AttributeGroup)
    const options = dataSource.getRepository(AttributeOption)
    const colour = await groups.save(groups.create({ businessId: h.businessId, name: 'Colour' }))
    const red = await options.save(
      options.create({ businessId: h.businessId, groupId: colour.id, value: 'Red' }),
    )
    expect(await decideAttributeOptionRemoval(dataSource.manager, h.businessId, red.id)).toBeNull()

    const category = await seedCategory()
    const links = dataSource.getRepository(CategoryAttributeGroup)
    const link = await links.save(
      links.create({
        businessId: h.businessId,
        categoryId: category.id,
        attributeGroupId: colour.id,
      }),
    )
    expect(
      await loadAttributeGroupRemovalPlan(dataSource.manager, h.businessId, colour.id),
    ).toEqual({ ok: false, code: 'ATTRIBUTE_GROUP_IN_USE', cause: 'CATEGORIES' })

    await links.softDelete(link.id)
    const plan = await loadAttributeGroupRemovalPlan(dataSource.manager, h.businessId, colour.id)
    if (!plan.ok) throw new Error('expected a removable attribute')
    expect(plan.optionIds).toEqual([red.id])
    await dataSource.transaction((m) => applyAttributeGroupRemoval(m, h.businessId, plan, at))

    const [option] = (await dataSource.query(
      `SELECT deleted_at IS NOT NULL AS deleted, is_active FROM attribute_options WHERE id = $1`,
      [red.id],
    )) as Array<{ deleted: boolean; is_active: boolean }>
    expect(option).toEqual({ deleted: true, is_active: false })
  })
})
