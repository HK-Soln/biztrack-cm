/// <reference types="jest" />
import { SyncService } from '../sync.service'

// These handlers persist via their repo and otherwise just shape data; we bypass the
// (30+ dep) constructor and wire only the repo each handler touches.
const recordUpdatedAt = new Date('2026-06-15T00:00:00.000Z')

const makeGroupService = (existing: unknown) => {
  const repo = {
    findOne: jest.fn().mockResolvedValue(existing),
    update: jest.fn(),
    save: jest.fn(async (e) => e),
    create: jest.fn((e) => e),
  }
  const service = Object.create(SyncService.prototype) as any
  service.attributeGroupsRepo = repo
  return { service, repo }
}

const op = (overrides: Record<string, unknown> = {}) =>
  ({
    recordId: 'grp-1',
    action: 'UPSERT',
    recordUpdatedAt,
    payload: { name: 'Color', displayType: 'SWATCHES' },
    ...overrides,
  }) as any

describe('SyncService.applyAttributeGroupOperation', () => {
  it('creates a new group when none exists', async () => {
    const { service, repo } = makeGroupService(null)
    const result = await service.applyAttributeGroupOperation('biz-1', op())
    expect(result.status).toBe('applied')
    expect(repo.save).toHaveBeenCalledTimes(1)
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'grp-1', businessId: 'biz-1', name: 'Color', displayType: 'SWATCHES' }),
    )
  })

  it('coerces an unknown display type to CHIPS', async () => {
    const { service, repo } = makeGroupService(null)
    await service.applyAttributeGroupOperation('biz-1', op({ payload: { name: 'X', displayType: 'BOGUS' } }))
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ displayType: 'CHIPS' }))
  })

  it('server-wins when the incoming record is not newer', async () => {
    const { service, repo } = makeGroupService({
      id: 'grp-1',
      businessId: 'biz-1',
      updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    })
    const result = await service.applyAttributeGroupOperation('biz-1', op())
    expect(result).toEqual({ status: 'conflict', resolution: 'server_wins' })
    expect(repo.update).not.toHaveBeenCalled()
  })

  it('soft-deletes on a DELETE action', async () => {
    const { service, repo } = makeGroupService({
      id: 'grp-1',
      businessId: 'biz-1',
      updatedAt: new Date('2020-01-01T00:00:00.000Z'),
    })
    const result = await service.applyAttributeGroupOperation('biz-1', op({ action: 'DELETE' }))
    expect(result.status).toBe('applied')
    expect(repo.update).toHaveBeenCalledWith('grp-1', expect.objectContaining({ isActive: false }))
  })
})

describe('SyncService.applyCategoryAttributeGroupOperation', () => {
  const makeLinkService = (existing: unknown) => {
    const repo = {
      findOne: jest.fn().mockResolvedValue(existing),
      update: jest.fn(),
      save: jest.fn(async (e) => e),
      create: jest.fn((e) => e),
    }
    const service = Object.create(SyncService.prototype) as any
    service.categoryAttributeGroupsRepo = repo
    return { service, repo }
  }

  it('creates a link with categoryId + attributeGroupId', async () => {
    const { service, repo } = makeLinkService(null)
    const result = await service.applyCategoryAttributeGroupOperation('biz-1', {
      recordId: 'lnk-1',
      action: 'UPSERT',
      recordUpdatedAt,
      payload: { categoryId: 'cat-1', attributeGroupId: 'grp-1', isRequired: false, sortOrder: 2 },
    } as any)
    expect(result.status).toBe('applied')
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: 'cat-1', attributeGroupId: 'grp-1', isRequired: false, sortOrder: 2 }),
    )
  })

  it('rejects a link missing its references', async () => {
    const { service } = makeLinkService(null)
    await expect(
      service.applyCategoryAttributeGroupOperation('biz-1', {
        recordId: 'lnk-1',
        action: 'UPSERT',
        recordUpdatedAt,
        payload: { categoryId: 'cat-1' },
      } as any),
    ).rejects.toThrow()
  })
})
