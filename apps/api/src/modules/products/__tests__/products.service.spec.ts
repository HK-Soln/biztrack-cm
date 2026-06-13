/// <reference types="jest" />
import { Product } from '@/entities/product.entity'
import { InventoryLevel } from '@/entities/inventory-level.entity'
import { InventoryMovement, MovementType } from '@/entities/inventory-movement.entity'
import { ProductsService } from '../services/products.service'

const makeService = () => {
  const transactionProductRepo = {
    create: jest.fn((input) => input),
    save: jest.fn(async (input) => ({ id: 'product-1', ...input })),
  }
  const transactionInventoryRepo = {
    create: jest.fn((input) => input),
    save: jest.fn(async (input) => input),
  }
  const transactionMovementRepo = {
    create: jest.fn((input) => input),
    save: jest.fn(async (input) => input),
  }
  const manager = {
    getRepository: jest.fn((entity) => {
      if (entity === Product) return transactionProductRepo
      if (entity === InventoryLevel) return transactionInventoryRepo
      if (entity === InventoryMovement) return transactionMovementRepo
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
