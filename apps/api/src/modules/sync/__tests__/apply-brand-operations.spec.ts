/// <reference types="jest" />
import { SyncService } from '../sync.service'

const recordUpdatedAt = new Date('2026-06-15T00:00:00.000Z')

const makeBrandService = (existing: unknown) => {
  const repo = {
    findOne: jest.fn().mockResolvedValue(existing),
    update: jest.fn(),
    save: jest.fn(async (e) => e),
    create: jest.fn((e) => e),
  }
  const service = Object.create(SyncService.prototype) as any
  service.brandsRepo = repo
  return { service, repo }
}

describe('SyncService.applyBrandOperation', () => {
  it('creates a brand, deriving a slug from the name when none is sent', async () => {
    const { service, repo } = makeBrandService(null)
    const result = await service.applyBrandOperation('biz-1', {
      recordId: 'br-1',
      action: 'UPSERT',
      recordUpdatedAt,
      payload: { name: 'Samsung' },
    } as any)
    expect(result.status).toBe('applied')
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'br-1', businessId: 'biz-1', name: 'Samsung', slug: 'samsung' }),
    )
  })

  it('server-wins when the incoming brand is not newer', async () => {
    const { service, repo } = makeBrandService({
      id: 'br-1',
      businessId: 'biz-1',
      updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    })
    const result = await service.applyBrandOperation('biz-1', {
      recordId: 'br-1',
      action: 'UPSERT',
      recordUpdatedAt,
      payload: { name: 'Samsung' },
    } as any)
    expect(result).toEqual({ status: 'conflict', resolution: 'server_wins' })
    expect(repo.update).not.toHaveBeenCalled()
  })
})

describe('SyncService.applyBrandCategoryOperation', () => {
  const makeLinkService = (existing: unknown) => {
    const repo = {
      findOne: jest.fn().mockResolvedValue(existing),
      update: jest.fn(),
      save: jest.fn(async (e) => e),
      create: jest.fn((e) => e),
    }
    const service = Object.create(SyncService.prototype) as any
    service.brandCategoriesRepo = repo
    return { service, repo }
  }

  it('creates a brand-category link', async () => {
    const { service, repo } = makeLinkService(null)
    const result = await service.applyBrandCategoryOperation('biz-1', {
      recordId: 'bc-1',
      action: 'UPSERT',
      recordUpdatedAt,
      payload: { brandId: 'br-1', categoryId: 'cat-1' },
    } as any)
    expect(result.status).toBe('applied')
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: 'br-1', categoryId: 'cat-1', businessId: 'biz-1' }),
    )
  })

  it('rejects a link missing its references', async () => {
    const { service } = makeLinkService(null)
    await expect(
      service.applyBrandCategoryOperation('biz-1', {
        recordId: 'bc-1',
        action: 'UPSERT',
        recordUpdatedAt,
        payload: { brandId: 'br-1' },
      } as any),
    ).rejects.toThrow()
  })
})
