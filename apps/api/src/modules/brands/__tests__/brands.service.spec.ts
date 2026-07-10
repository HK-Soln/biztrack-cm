/// <reference types="jest" />
import { Brand } from '@/entities/brand.entity'
import { BrandCategory } from '@/entities/brand-category.entity'
import { Model } from '@/entities/model.entity'
import { BrandsService } from '../services/brands.service'

const ctxArg = { businessId: 'biz-1', actorId: 'u1' } as any

function makeService(opts: { brand?: any; model?: any; existingLinks?: any[] } = {}) {
  const brand = opts.brand ?? {
    id: 'b1',
    businessId: 'biz-1',
    name: 'Samsung',
    slug: 'samsung',
    isActive: true,
    sortOrder: 0,
    models: [],
    categoryLinks: [],
  }
  const brandsRepo = {
    findOne: jest.fn(async ({ where }: any) => {
      if (where.slug) return null // uniqueSlug → no clash
      if (where.id) return brand // findById
      return null
    }),
    update: jest.fn(async () => ({ affected: 1 })),
    find: jest.fn(async () => [brand]),
    createQueryBuilder: jest.fn(),
    manager: { query: jest.fn().mockResolvedValue(opts.brandInUse ? [{ n: 1 }] : []) },
  }
  const modelsRepo = {
    findOne: jest.fn(async () => opts.model ?? null),
    save: jest.fn(async (m: any) => ({ id: 'm1', ...m })),
    create: jest.fn((m: any) => m),
    update: jest.fn(async () => ({ affected: 1 })),
    manager: { query: jest.fn().mockResolvedValue(opts.modelInUse ? [{ n: 1 }] : []) },
  }

  const mBrandRepo = {
    create: jest.fn((b: any) => b),
    save: jest.fn(async (b: any) => ({ id: 'b1', ...b })),
    update: jest.fn(async () => ({})),
  }
  const mModelRepo = { update: jest.fn(async () => ({})) }
  const mLinkRepo = {
    find: jest.fn(async () => opts.existingLinks ?? []),
    save: jest.fn(async (x: any) => x),
    create: jest.fn((x: any) => x),
    softDelete: jest.fn(async () => ({})),
  }
  const manager = {
    getRepository: jest.fn((e: unknown) => {
      if (e === Brand) return mBrandRepo
      if (e === Model) return mModelRepo
      if (e === BrandCategory) return mLinkRepo
      return {}
    }),
  }
  const dataSource = { transaction: jest.fn(async (cb: any) => cb(manager)) }
  const auditService = { log: jest.fn() }
  const i18n = { translate: jest.fn(async (k: string) => k) }
  const logger = { setContext: jest.fn(), warn: jest.fn(), error: jest.fn() }

  const service = new BrandsService(
    brandsRepo as any,
    modelsRepo as any,
    dataSource as any,
    auditService as any,
    i18n as any,
    logger as any,
  )
  return { service, brandsRepo, modelsRepo, mBrandRepo, mModelRepo, mLinkRepo, auditService }
}

describe('BrandsService', () => {
  it('create: generates a slug, saves the brand, links categories, audits CREATE', async () => {
    const { service, mBrandRepo, mLinkRepo, auditService } = makeService()
    await service.create('biz-1', { name: 'Samsung', categoryIds: ['c1', 'c2'] } as any, ctxArg)
    expect(mBrandRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Samsung', slug: 'samsung' }),
    )
    expect(mLinkRepo.save).toHaveBeenCalledWith([
      expect.objectContaining({ brandId: 'b1', categoryId: 'c1' }),
      expect.objectContaining({ brandId: 'b1', categoryId: 'c2' }),
    ])
    expect(auditService.log).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'CREATE', entityType: 'brand' }),
    )
  })

  it('update: reconciles category links (adds new, soft-deletes removed) + audits', async () => {
    const { service, mLinkRepo, auditService } = makeService({
      brand: {
        id: 'b1',
        businessId: 'biz-1',
        name: 'Samsung',
        slug: 'samsung',
        isActive: true,
        sortOrder: 0,
        models: [],
        categoryLinks: [{ id: 'l1', categoryId: 'c1' }],
      },
    })
    mLinkRepo.find = jest.fn(async () => [{ id: 'l1', categoryId: 'c1' }]) as any
    await service.update('b1', 'biz-1', { categoryIds: ['c2'] } as any, ctxArg)
    expect(mLinkRepo.softDelete).toHaveBeenCalled() // removed c1
    expect(mLinkRepo.save).toHaveBeenCalledWith([expect.objectContaining({ categoryId: 'c2' })]) // added c2
    expect(auditService.log).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'UPDATE', entityType: 'brand' }),
    )
  })

  it('remove: soft-deletes models + links + brand, audits DELETE', async () => {
    const { service, mBrandRepo, mModelRepo, mLinkRepo, auditService } = makeService()
    await service.remove('b1', 'biz-1', ctxArg)
    expect(mModelRepo.update).toHaveBeenCalled()
    expect(mLinkRepo.softDelete).toHaveBeenCalled()
    expect(mBrandRepo.update).toHaveBeenCalledWith(
      { id: 'b1', businessId: 'biz-1' },
      expect.objectContaining({ isActive: false }),
    )
    expect(auditService.log).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'DELETE', entityType: 'brand' }),
    )
  })

  it('addModel: creates a model under the brand + audits', async () => {
    const { service, modelsRepo, auditService } = makeService()
    await service.addModel('b1', 'biz-1', { name: 'Galaxy S24' } as any, ctxArg)
    expect(modelsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: 'b1', name: 'Galaxy S24' }),
    )
    expect(auditService.log).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'CREATE', entityType: 'model' }),
    )
  })

  it('findById: throws when the brand does not exist', async () => {
    const { service, brandsRepo } = makeService()
    brandsRepo.findOne = jest.fn(async () => null) as any
    await expect(service.findById('nope', 'biz-1')).rejects.toMatchObject({
      code: 'BRAND_NOT_FOUND',
    })
  })

  it('removeModel: 404 when the model is not under the brand', async () => {
    const { service } = makeService({ model: null })
    await expect(service.removeModel('b1', 'mX', 'biz-1', ctxArg)).rejects.toMatchObject({
      code: 'MODEL_NOT_FOUND',
    })
  })
})
