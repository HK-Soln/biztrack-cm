/// <reference types="jest" />
import { Product } from '@/entities/product.entity'
import { InventoryLevel } from '@/entities/inventory-level.entity'
import { InventoryMovement, MovementType } from '@/entities/inventory-movement.entity'
import { ProductVariant } from '@/entities/product-variant.entity'
import { ProductVariantOption } from '@/entities/product-variant-option.entity'
import { ProductSerialUnit } from '@/entities/product-serial-unit.entity'
import { ProductImage } from '@/entities/product-image.entity'
import { ProductsService } from '../services/products.service'

const qb = (rawOne: unknown) => {
  const chain: any = {
    select: jest.fn(() => chain),
    where: jest.fn(() => chain),
    update: jest.fn(() => chain),
    set: jest.fn(() => chain),
    getRawOne: jest.fn(async () => rawOne),
    execute: jest.fn(async () => ({ affected: 0 })),
  }
  return chain
}

const makeService = () => {
  const transactionProductRepo = {
    create: jest.fn((input) => input),
    save: jest.fn(async (input) => ({ id: 'product-1', ...input })),
    update: jest.fn(async () => ({ affected: 1 })),
  }
  const transactionInventoryRepo = {
    create: jest.fn((input) => input),
    save: jest.fn(async (input) => input),
    update: jest.fn(async () => ({ affected: 1 })),
    createQueryBuilder: jest.fn(() => qb({ s: '0' })),
  }
  const transactionMovementRepo = {
    create: jest.fn((input) => input),
    save: jest.fn(async (input) => input),
  }
  const transactionVariantRepo = { find: jest.fn(async () => []), update: jest.fn(async () => ({ affected: 0 })) }
  const transactionOptionRepo = { softDelete: jest.fn(async () => ({ affected: 0 })) }
  const transactionSerialRepo = { count: jest.fn(async () => 0), createQueryBuilder: jest.fn(() => qb(null)) }
  const transactionImageRepo = { delete: jest.fn(async () => ({ affected: 0 })) }
  const manager = {
    getRepository: jest.fn((entity) => {
      if (entity === Product) return transactionProductRepo
      if (entity === InventoryLevel) return transactionInventoryRepo
      if (entity === InventoryMovement) return transactionMovementRepo
      if (entity === ProductVariant) return transactionVariantRepo
      if (entity === ProductVariantOption) return transactionOptionRepo
      if (entity === ProductSerialUnit) return transactionSerialRepo
      if (entity === ProductImage) return transactionImageRepo
      throw new Error(`Unexpected repository request: ${entity}`)
    }),
  }
  const dataSource = {
    transaction: jest.fn(async (callback: (input: typeof manager) => unknown) => callback(manager)),
  }
  const productsRepo = {
    findOne: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
  }
  const categoriesRepo = {
    findOne: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
  }
  const businessesRepo = { findOne: jest.fn() }
  const unitsRepo = { findOne: jest.fn() }
  const inventoryLevelsRepo = { findOne: jest.fn(), find: jest.fn() }
  const inventoryMovementsRepo = { find: jest.fn() }
  const imagesRepo = { find: jest.fn(), createQueryBuilder: jest.fn() }
  const bundleComponentsRepo = { find: jest.fn() }
  const serialUnitsRepo = { find: jest.fn() }
  const slugService = { generateProductSlug: jest.fn() }
  const skuService = { generate: jest.fn(), validateAndNormalize: jest.fn() }
  const barcodeService = { generateFromSKU: jest.fn(), validateAndNormalize: jest.fn() }
  const variantsService = {
    createVariantsFromAttributeSelections: jest.fn(),
    previewVariantMatrix: jest.fn(),
    listVariantsForProduct: jest.fn(),
  }
  const auditService = { log: jest.fn() }
  const quotaService = { assertWithinQuota: jest.fn() }
  const i18n = { translate: jest.fn(async (key: string) => key) }
  const logger = {
    setContext: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }

  const service = new ProductsService(
    dataSource as any,
    productsRepo as any,
    categoriesRepo as any,
    businessesRepo as any,
    unitsRepo as any,
    inventoryLevelsRepo as any,
    inventoryMovementsRepo as any,
    imagesRepo as any,
    bundleComponentsRepo as any,
    serialUnitsRepo as any,
    slugService as any,
    skuService as any,
    barcodeService as any,
    variantsService as any,
    auditService as any,
    quotaService as any,
    i18n as any,
    logger as any,
  )

  return {
    service,
    businessesRepo,
    unitsRepo,
    categoriesRepo,
    slugService,
    skuService,
    barcodeService,
    transactionProductRepo,
    transactionInventoryRepo,
    transactionMovementRepo,
    transactionVariantRepo,
    transactionOptionRepo,
    transactionSerialRepo,
    transactionImageRepo,
    auditService,
  }
}

describe('ProductsService', () => {
  it('forces a SERVICE product to be non-inventory-tracked even if trackInventory=true is sent', async () => {
    const {
      service,
      businessesRepo,
      unitsRepo,
      slugService,
      skuService,
      barcodeService,
      transactionProductRepo,
      transactionInventoryRepo,
      transactionMovementRepo,
    } = makeService()

    businessesRepo.findOne.mockResolvedValue({ id: 'business-1', currency: 'XAF' })
    unitsRepo.findOne.mockResolvedValue({ id: 'uom-1', businessId: null })
    slugService.generateProductSlug.mockResolvedValue('consultation-pack')
    skuService.generate.mockResolvedValue('GEN-ABC123')
    barcodeService.generateFromSKU.mockReturnValue({
      value: '2000000000001',
      type: 'INTERNAL',
      isGenerated: true,
    })

    jest.spyOn(service, 'findById').mockResolvedValue({
      id: 'product-1',
      businessId: 'business-1',
      name: 'Consultation Pack',
      slug: 'consultation-pack',
      sku: 'GEN-ABC123',
      barcode: '2000000000001',
      barcodeType: 'INTERNAL',
      isBarcodeGenerated: true,
      sellingPrice: 12000,
      costPrice: null,
      currency: 'XAF',
      taxRate: 0,
      isActive: true,
      isService: true,
      trackInventory: true,
      categoryId: null,
      category: null,
      unitOfMeasure: { id: 'uom-1', name: 'Piece', type: 'QUANTITY', isDefault: true },
      imageUrl: null,
      createdById: 'user-1',
      createdBy: null,
      description: null,
      images: [],
      currentStock: 4,
      lowStockThreshold: 1,
      reorderPoint: null,
      primaryImageUrl: null,
    } as any)

    await service.create('business-1', 'user-1', {
      name: 'Consultation Pack',
      unitOfMeasureId: 'uom-1',
      sellingPrice: 12000,
      isService: true,
      trackInventory: true,
      openingStock: 4,
      lowStockThreshold: 1,
    })

    // productType is authoritative: SERVICE never carries stock, so the
    // contradictory trackInventory=true is overridden to false and no
    // inventory level is created.
    expect(transactionProductRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        productType: 'SERVICE',
        isService: true,
        trackInventory: false,
      }),
    )
    expect(transactionInventoryRepo.create).not.toHaveBeenCalled()
    expect(transactionMovementRepo.create).not.toHaveBeenCalled()
  })

  it('rejects assigning a product to a non-leaf category', async () => {
    const { service, businessesRepo, unitsRepo, categoriesRepo, slugService, skuService, barcodeService } =
      makeService()

    businessesRepo.findOne.mockResolvedValue({ id: 'business-1', currency: 'XAF' })
    unitsRepo.findOne.mockResolvedValue({ id: 'uom-1', businessId: null })
    categoriesRepo.findOne.mockResolvedValue({ id: 'cat-1', businessId: 'business-1' })
    categoriesRepo.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(2), // has active children → not a leaf
    })
    slugService.generateProductSlug.mockResolvedValue('phone')
    skuService.generate.mockResolvedValue('GEN-1')
    barcodeService.generateFromSKU.mockReturnValue({
      value: '2000000000002',
      type: 'INTERNAL',
      isGenerated: true,
    })

    await expect(
      service.create('business-1', 'user-1', {
        name: 'Phone',
        unitOfMeasureId: 'uom-1',
        sellingPrice: 1000,
        categoryId: 'cat-1',
      }),
    ).rejects.toMatchObject({ code: 'CATEGORY_NOT_LEAF' })
  })
})

describe('ProductsService.softDelete (cascade + write-off)', () => {
  it('non-serialised: writes off remaining stock and cascades variants/options/images/levels', async () => {
    const ctx = makeService()
    jest.spyOn(ctx.service, 'findById').mockResolvedValue({ id: 'p1', name: 'Tee', isSerialized: false } as any)
    ctx.transactionInventoryRepo.createQueryBuilder = jest.fn(() => qb({ s: '8' })) as any
    ctx.transactionVariantRepo.find = jest.fn(async () => [{ id: 'v1' }, { id: 'v2' }]) as any

    await ctx.service.softDelete('p1', 'biz-1', { businessId: 'biz-1', actorId: 'u1' } as any)

    expect(ctx.transactionOptionRepo.softDelete).toHaveBeenCalled()
    expect(ctx.transactionVariantRepo.update).toHaveBeenCalled()
    expect(ctx.transactionImageRepo.delete).toHaveBeenCalledWith({ productId: 'p1' })
    expect(ctx.transactionMovementRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: MovementType.MANUAL_ADJUSTMENT, quantityChange: -8, quantityBefore: 8, quantityAfter: 0, referenceType: 'product' }),
    )
    expect(ctx.transactionProductRepo.update).toHaveBeenCalledWith('p1', expect.objectContaining({ isActive: false }))
    expect(ctx.auditService.log).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'DELETE', entityType: 'product' }))
  })

  it('serialised: retires IN_STOCK units and writes off their count', async () => {
    const ctx = makeService()
    jest.spyOn(ctx.service, 'findById').mockResolvedValue({ id: 'p1', name: 'Phone', isSerialized: true } as any)
    ctx.transactionSerialRepo.count = jest.fn(async () => 3) as any

    await ctx.service.softDelete('p1', 'biz-1', { businessId: 'biz-1', actorId: 'u1' } as any)

    expect(ctx.transactionSerialRepo.createQueryBuilder).toHaveBeenCalled()
    expect(ctx.transactionMovementRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ quantityChange: -3, quantityBefore: 3, quantityAfter: 0 }),
    )
  })

  it('no stock → no write-off movement, but still soft-deletes the product', async () => {
    const ctx = makeService()
    jest.spyOn(ctx.service, 'findById').mockResolvedValue({ id: 'p1', name: 'Svc', isSerialized: false } as any)
    // default inventory QB returns s:'0'
    await ctx.service.softDelete('p1', 'biz-1', { businessId: 'biz-1', actorId: 'u1' } as any)
    expect(ctx.transactionMovementRepo.create).not.toHaveBeenCalled()
    expect(ctx.transactionProductRepo.update).toHaveBeenCalledWith('p1', expect.objectContaining({ deletedAt: expect.anything() }))
  })
})
