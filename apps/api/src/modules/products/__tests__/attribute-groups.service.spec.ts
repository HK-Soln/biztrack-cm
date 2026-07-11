/// <reference types="jest" />
import { AttributeDisplayType } from '@biztrack/types'
import { AttributeGroupsService } from '../services/attribute-groups.service'

// Chainable query-builder mock whose getExists() resolves to `exists`. Uniqueness checks now
// use createQueryBuilder(...).getExists() (case-insensitive, partial), not findOne().
const makeQb = (exists = false) => {
  const qb: any = {
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    getExists: jest.fn(async () => exists),
  }
  return qb
}

const makeService = () => {
  const groupsRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((input) => input),
    save: jest.fn(async (input) => ({ id: 'group-1', ...input })),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    createQueryBuilder: jest.fn(() => makeQb(false)),
  }
  const optionsRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((input) => input),
    save: jest.fn(async (input) => input),
    update: jest.fn(),
    createQueryBuilder: jest.fn(() => makeQb(false)),
  }
  const linksRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((input) => input),
    save: jest.fn(async (input) => ({ id: 'link-1', ...input })),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  }
  const categoriesService = { findById: jest.fn() }
  const i18n = { translate: jest.fn(async (key: string) => key) }
  const logger = { setContext: jest.fn(), warn: jest.fn(), error: jest.fn() }

  const service = new AttributeGroupsService(
    groupsRepo as any,
    optionsRepo as any,
    linksRepo as any,
    categoriesService as any,
    i18n as any,
    logger as any,
  )
  return { service, groupsRepo, optionsRepo, linksRepo, categoriesService }
}

describe('AttributeGroupsService', () => {
  describe('createGroup', () => {
    it('creates a group when the name is free', async () => {
      const { service, groupsRepo } = makeService()
      await service.createGroup('biz-1', {
        name: 'Color',
        displayType: AttributeDisplayType.SWATCHES,
      })
      expect(groupsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ businessId: 'biz-1', name: 'Color', displayType: 'SWATCHES' }),
      )
    })

    it('rejects a duplicate group name', async () => {
      const { service, groupsRepo } = makeService()
      groupsRepo.createQueryBuilder.mockReturnValue(makeQb(true))
      await expect(
        service.createGroup('biz-1', { name: 'Color', displayType: AttributeDisplayType.CHIPS }),
      ).rejects.toMatchObject({ code: 'ATTRIBUTE_GROUP_NAME_EXISTS' })
    })
  })

  describe('addOption', () => {
    it('rejects a duplicate option value within a group', async () => {
      const { service, groupsRepo, optionsRepo } = makeService()
      groupsRepo.findOne.mockResolvedValue({ id: 'g1', businessId: 'biz-1' })
      optionsRepo.createQueryBuilder.mockReturnValue(makeQb(true))
      await expect(service.addOption('g1', 'biz-1', { value: '128GB' })).rejects.toMatchObject({
        code: 'ATTRIBUTE_OPTION_EXISTS',
      })
    })
  })

  describe('removeGroup', () => {
    it('refuses to delete a group linked to a category', async () => {
      const { service, groupsRepo, linksRepo } = makeService()
      groupsRepo.findOne.mockResolvedValue({ id: 'g1', businessId: 'biz-1' })
      linksRepo.count.mockResolvedValue(2)
      await expect(service.removeGroup('g1', 'biz-1')).rejects.toMatchObject({
        code: 'ATTRIBUTE_GROUP_IN_USE',
      })
    })
  })

  describe('linkToCategory', () => {
    it('rejects linking to a non-leaf category', async () => {
      const { service, categoriesService } = makeService()
      categoriesService.findById.mockResolvedValue({ id: 'c1', isLeaf: false })
      await expect(
        service.linkToCategory('c1', 'biz-1', { attributeGroupId: 'g1' }),
      ).rejects.toMatchObject({ code: 'CATEGORY_NOT_LEAF' })
    })

    it('links a group to a leaf category', async () => {
      const { service, categoriesService, groupsRepo, linksRepo } = makeService()
      categoriesService.findById.mockResolvedValue({ id: 'c1', isLeaf: true })
      groupsRepo.findOne.mockResolvedValue({ id: 'g1', businessId: 'biz-1' })
      await service.linkToCategory('c1', 'biz-1', { attributeGroupId: 'g1', isRequired: true })
      expect(linksRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ categoryId: 'c1', attributeGroupId: 'g1', isRequired: true }),
      )
    })
  })

  describe('seedDefaults', () => {
    it('seeds default groups when the business has none', async () => {
      const { service, groupsRepo } = makeService()
      groupsRepo.count.mockResolvedValue(0)
      await service.seedDefaults('biz-1')
      // 8 default groups (Color, Storage, Size, RAM, Dosage, Weight, Material, Voltage)
      expect(groupsRepo.save).toHaveBeenCalledTimes(8)
    })

    it('is idempotent — does nothing when groups already exist', async () => {
      const { service, groupsRepo } = makeService()
      groupsRepo.count.mockResolvedValue(8)
      await service.seedDefaults('biz-1')
      expect(groupsRepo.save).not.toHaveBeenCalled()
    })
  })
})
