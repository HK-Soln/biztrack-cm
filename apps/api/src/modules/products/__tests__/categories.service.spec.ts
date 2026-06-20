/// <reference types="jest" />
import { CategoriesService } from '../services/categories.service'

const makeQb = () => ({
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  addSelect: jest.fn().mockReturnThis(),
  groupBy: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  getCount: jest.fn().mockResolvedValue(0),
  getRawMany: jest.fn().mockResolvedValue([]),
})

const makeService = () => {
  const categoryQb = makeQb()
  const productQb = makeQb()
  const categoriesRepo = {
    findOne: jest.fn(),
    create: jest.fn((input) => input),
    save: jest.fn(async (input) => ({ id: 'cat-new', ...input })),
    update: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    paginate: jest.fn(),
    createQueryBuilder: jest.fn(() => categoryQb),
  }
  const productsRepo = { createQueryBuilder: jest.fn(() => productQb) }
  const categoryAttributeGroupsRepo = {
    count: jest.fn().mockResolvedValue(0),
    find: jest.fn().mockResolvedValue([]),
  }
  const brandCategoriesRepo = { find: jest.fn().mockResolvedValue([]) }
  const slugService = { generateCategorySlug: jest.fn().mockResolvedValue('slug') }
  const quotaService = { assertWithinQuota: jest.fn() }
  const storage = { existsByUrl: jest.fn().mockResolvedValue(true) }
  const i18n = { translate: jest.fn(async (key: string) => key) }
  const logger = { setContext: jest.fn(), warn: jest.fn(), error: jest.fn() }

  const service = new CategoriesService(
    categoriesRepo as any,
    productsRepo as any,
    categoryAttributeGroupsRepo as any,
    brandCategoriesRepo as any,
    slugService as any,
    quotaService as any,
    storage as any,
    i18n as any,
    logger as any,
  )

  return { service, categoriesRepo, productsRepo, categoryAttributeGroupsRepo, brandCategoriesRepo, categoryQb, productQb }
}

describe('CategoriesService — hierarchy', () => {
  describe('create', () => {
    it('creates an L1 category (no parent) at depth 1', async () => {
      const { service, categoriesRepo } = makeService()

      await service.create('biz-1', { name: 'Electronics' })

      expect(categoriesRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ depth: 1, parentId: null }),
      )
    })

    it('creates an L2 category under an L1 parent at depth 2', async () => {
      const { service, categoriesRepo } = makeService()
      categoriesRepo.findOne.mockResolvedValue({ id: 'p1', businessId: 'biz-1', depth: 1 })

      await service.create('biz-1', { name: 'Phones', parentId: 'p1' })

      expect(categoriesRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ depth: 2, parentId: 'p1' }),
      )
    })

    it('creates an L3 category under an L2 parent at depth 3', async () => {
      const { service, categoriesRepo } = makeService()
      categoriesRepo.findOne.mockResolvedValue({ id: 'p2', businessId: 'biz-1', depth: 2 })

      await service.create('biz-1', { name: 'Smartphones', parentId: 'p2' })

      expect(categoriesRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ depth: 3, parentId: 'p2' }),
      )
    })

    it('rejects an L4 category (parent already at depth 3)', async () => {
      const { service, categoriesRepo } = makeService()
      categoriesRepo.findOne.mockResolvedValue({ id: 'p3', businessId: 'biz-1', depth: 3 })

      await expect(
        service.create('biz-1', { name: 'Too deep', parentId: 'p3' }),
      ).rejects.toMatchObject({ code: 'MAX_DEPTH_EXCEEDED' })
      expect(categoriesRepo.create).not.toHaveBeenCalled()
    })

    it('rejects nesting under a parent that already has products', async () => {
      const { service, categoriesRepo, productQb } = makeService()
      categoriesRepo.findOne.mockResolvedValue({ id: 'p1', businessId: 'biz-1', depth: 1 })
      productQb.getCount.mockResolvedValue(3)

      await expect(
        service.create('biz-1', { name: 'Phones', parentId: 'p1' }),
      ).rejects.toMatchObject({ code: 'PARENT_HAS_PRODUCTS' })
    })

    it('rejects when the parent does not exist', async () => {
      const { service, categoriesRepo } = makeService()
      categoriesRepo.findOne.mockResolvedValue(null)

      await expect(
        service.create('biz-1', { name: 'Orphan', parentId: 'missing' }),
      ).rejects.toMatchObject({ code: 'CATEGORY_PARENT_NOT_FOUND' })
    })
  })

  describe('isLeaf (findById)', () => {
    it('is a leaf when it has no active children', async () => {
      const { service, categoriesRepo, categoryQb } = makeService()
      categoriesRepo.findOne.mockResolvedValue({ id: 'c1', businessId: 'biz-1', depth: 1 })
      categoryQb.getCount.mockResolvedValue(0)

      const result = await service.findById('c1', 'biz-1')
      expect(result.isLeaf).toBe(true)
    })

    it('is not a leaf once it has active children', async () => {
      const { service, categoriesRepo, categoryQb } = makeService()
      categoriesRepo.findOne.mockResolvedValue({ id: 'c1', businessId: 'biz-1', depth: 1 })
      categoryQb.getCount.mockResolvedValue(2)

      const result = await service.findById('c1', 'biz-1')
      expect(result.isLeaf).toBe(false)
    })
  })
})
