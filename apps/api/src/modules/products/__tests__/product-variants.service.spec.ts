/// <reference types="jest" />
import { AttributeGroup } from '@/entities/attribute-group.entity'
import { AttributeOption } from '@/entities/attribute-option.entity'
import { InventoryLevel } from '@/entities/inventory-level.entity'
import { InventoryMovement } from '@/entities/inventory-movement.entity'
import { Product } from '@/entities/product.entity'
import { ProductVariant } from '@/entities/product-variant.entity'
import { ProductVariantOption } from '@/entities/product-variant-option.entity'
import { ProductVariantsService } from '../services/product-variants.service'

const GROUPS = [
  { id: 'g-color', name: 'Color', sortOrder: 0, businessId: 'b-1' },
  { id: 'g-storage', name: 'Storage', sortOrder: 1, businessId: 'b-1' },
]
const OPTIONS = [
  { id: 'o-black', value: 'Black', groupId: 'g-color', colorHex: '#000', sortOrder: 0 },
  { id: 'o-blue', value: 'Blue', groupId: 'g-color', colorHex: '#00f', sortOrder: 1 },
  { id: 'o-128', value: '128GB', groupId: 'g-storage', sortOrder: 0 },
  { id: 'o-256', value: '256GB', groupId: 'g-storage', sortOrder: 1 },
]

const makeService = () => {
  const groupsRepo = {
    findOne: jest.fn(async ({ where }: any) => GROUPS.find((g) => g.id === where.id) ?? null),
    find: jest.fn(async ({ where }: any) => {
      const ids = where.id?.value ?? []
      return GROUPS.filter((g) => ids.includes(g.id))
    }),
  }
  const optionsRepo = {
    find: jest.fn(async ({ where }: any) => {
      const ids = where.id?.value ?? []
      return OPTIONS.filter(
        (o) => ids.includes(o.id) && (where.groupId ? o.groupId === where.groupId : true),
      )
    }),
  }
  const variantsRepo = { find: jest.fn() }
  const variantOptionsRepo = { find: jest.fn() }
  const inventoryLevelsRepo = { find: jest.fn() }
  const i18n = { translate: jest.fn(async (key: string) => key) }
  const logger = { setContext: jest.fn(), warn: jest.fn(), error: jest.fn() }

  const service = new ProductVariantsService(
    groupsRepo as any,
    optionsRepo as any,
    variantsRepo as any,
    variantOptionsRepo as any,
    inventoryLevelsRepo as any,
    i18n as any,
    logger as any,
  )
  return { service, groupsRepo, optionsRepo }
}

const colorAndStorage = [
  { attributeGroupId: 'g-color', selectedOptionIds: ['o-black', 'o-blue'] },
  { attributeGroupId: 'g-storage', selectedOptionIds: ['o-128', 'o-256'] },
]

describe('ProductVariantsService.buildCombinations', () => {
  it('produces the Cartesian product in dimension order', () => {
    const { service } = makeService()
    const combos = service.buildCombinations([
      { group: GROUPS[0] as any, options: [OPTIONS[0], OPTIONS[1]] as any },
      { group: GROUPS[1] as any, options: [OPTIONS[2], OPTIONS[3]] as any },
    ])
    expect(combos.map((c) => c.map((o) => o.value).join(' '))).toEqual([
      'Black 128GB',
      'Black 256GB',
      'Blue 128GB',
      'Blue 256GB',
    ])
  })

  it('returns no combinations when there are no active dimensions', () => {
    const { service } = makeService()
    expect(service.buildCombinations([{ group: GROUPS[0] as any, options: [] }])).toEqual([])
  })
})

describe('ProductVariantsService.previewVariantMatrix', () => {
  it('previews 4 variants and flags excluded combinations', async () => {
    const { service } = makeService()
    const result = await service.previewVariantMatrix('b-1', colorAndStorage, [
      { optionIds: ['o-256', 'o-blue'], excluded: true },
    ])
    expect(result.totalCombinations).toBe(4)
    expect(result.variants.map((v) => v.name)).toEqual([
      'Black 128GB',
      'Black 256GB',
      'Blue 128GB',
      'Blue 256GB',
    ])
    const blue256 = result.variants.find((v) => v.name === 'Blue 256GB')
    expect(blue256?.excluded).toBe(true)
    const black128 = result.variants.find((v) => v.name === 'Black 128GB')
    expect(black128?.attributes).toEqual([
      { groupId: 'g-color', groupName: 'Color', optionId: 'o-black', optionValue: 'Black', colorHex: '#000' },
      { groupId: 'g-storage', groupName: 'Storage', optionId: 'o-128', optionValue: '128GB', colorHex: null },
    ])
  })

  it('throws when a selected option does not exist', async () => {
    const { service } = makeService()
    await expect(
      service.previewVariantMatrix('b-1', [
        { attributeGroupId: 'g-color', selectedOptionIds: ['o-black', 'o-missing'] },
      ]),
    ).rejects.toMatchObject({ code: 'ATTRIBUTE_OPTION_NOT_FOUND' })
  })
})

describe('ProductVariantsService.createVariantsFromAttributeSelections', () => {
  const makeManager = () => {
    const saved = {
      variants: [] as any[],
      options: [] as any[],
      levels: [] as any[],
      movements: [] as any[],
    }
    const variantRepo = {
      create: (input: any) => input,
      save: jest.fn(async (input: any) => {
        const row = { id: `v-${saved.variants.length}`, ...input }
        saved.variants.push(row)
        return row
      }),
    }
    const optionRepo = {
      create: (input: any) => input,
      save: jest.fn(async (rows: any) => {
        saved.options.push(...rows)
        return rows
      }),
    }
    const levelRepo = {
      create: (input: any) => input,
      save: jest.fn(async (input: any) => {
        saved.levels.push(input)
        return input
      }),
    }
    const movementRepo = {
      create: (input: any) => input,
      save: jest.fn(async (input: any) => {
        saved.movements.push(input)
        return input
      }),
    }
    const manager = {
      getRepository: (entity: any) => {
        if (entity === AttributeGroup) {
          return { findOne: async ({ where }: any) => GROUPS.find((g) => g.id === where.id) ?? null }
        }
        if (entity === AttributeOption) {
          return {
            find: async ({ where }: any) => {
              const ids = where.id?.value ?? []
              return OPTIONS.filter((o) => ids.includes(o.id) && o.groupId === where.groupId)
            },
          }
        }
        if (entity === ProductVariant) return variantRepo
        if (entity === ProductVariantOption) return optionRepo
        if (entity === InventoryLevel) return levelRepo
        if (entity === InventoryMovement) return movementRepo
        throw new Error(`Unexpected repo: ${entity}`)
      },
    }
    return { manager, saved }
  }

  const product = { id: 'p-1', trackInventory: true } as Product

  it('creates one variant per combination with option links and inventory levels', async () => {
    const { service } = makeService()
    const { manager, saved } = makeManager()

    const created = await service.createVariantsFromAttributeSelections(
      manager as any,
      product,
      colorAndStorage,
      [{ optionIds: ['o-black', 'o-128'], openingStock: 5 }],
      'b-1',
      'u-1',
    )

    expect(created).toHaveLength(4)
    expect(saved.variants.map((v) => v.name)).toEqual([
      'Black 128GB',
      'Black 256GB',
      'Blue 128GB',
      'Blue 256GB',
    ])
    // Each variant links to exactly its 2 attribute options.
    expect(saved.options).toHaveLength(8)
    // One inventory level per variant.
    expect(saved.levels).toHaveLength(4)
    // Opening-stock override only creates a movement for the one with qty > 0.
    expect(saved.movements).toHaveLength(1)
    expect(saved.movements[0]).toMatchObject({ quantityAfter: 5, referenceType: 'product_variant' })
  })

  it('skips excluded combinations', async () => {
    const { service } = makeService()
    const { manager, saved } = makeManager()

    await service.createVariantsFromAttributeSelections(
      manager as any,
      product,
      colorAndStorage,
      [{ optionIds: ['o-blue', 'o-256'], excluded: true }],
      'b-1',
      'u-1',
    )

    expect(saved.variants).toHaveLength(3)
    expect(saved.variants.map((v) => v.name)).not.toContain('Blue 256GB')
  })

  it('rejects a single-combination matrix (needs at least 2 variants)', async () => {
    const { service } = makeService()
    const { manager } = makeManager()

    await expect(
      service.createVariantsFromAttributeSelections(
        manager as any,
        product,
        [{ attributeGroupId: 'g-color', selectedOptionIds: ['o-black'] }],
        [],
        'b-1',
        'u-1',
      ),
    ).rejects.toMatchObject({ code: 'VARIANT_MIN_TWO' })
  })
})
