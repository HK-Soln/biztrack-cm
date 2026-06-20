/// <reference types="jest" />
import { InventoryLevel } from '@/entities/inventory-level.entity'
import { InventoryMovement, MovementType } from '@/entities/inventory-movement.entity'
import { Product } from '@/entities/product.entity'
import { ProductSerialUnit } from '@/entities/product-serial-unit.entity'
import { ProductVariant } from '@/entities/product-variant.entity'
import { ProductVariantOption } from '@/entities/product-variant-option.entity'
import { ProductVariantManagementService } from '../services/product-variant-management.service'

// A variant's stock = its own quantity (non-serialised) or its serial-unit count.
// Adding a variant with opening stock writes a stock-in; removing one writes off
// its remaining stock (stock-out, retiring serial units for serialised products);
// editing name/price/etc. writes NO movement. All mutations are audited.

const context = {
  businessId: 'biz-1', actorId: 'user-1', actorType: 'BUSINESS_USER' as const, actorName: 'Ada',
  actorRole: 'OWNER', ipAddress: null, deviceId: null, deviceType: null, deviceInfo: null, requestId: null,
}

function makeService(opts: {
  product?: any
  existingVariants?: any[]
  variant?: any
  variantStockTotal?: number
  variantLevelQty?: number
  inStockSerials?: any[]
  movementHistory?: number
} = {}) {
  const product = opts.product ?? { id: 'p1', businessId: 'biz-1', trackInventory: true, isSerialized: false, hasVariants: true }
  const enriched = [
    { id: 'v-new', businessId: 'biz-1', productId: 'p1', name: 'Black', isActive: true, sortOrder: 0, options: [], currentStock: 0 },
    ...(opts.variant ? [{ id: opts.variant.id, businessId: 'biz-1', productId: 'p1', name: opts.variant.name ?? 'Black', isActive: true, sortOrder: 0, options: [], currentStock: 0 }] : []),
  ]

  const productsRepo = { findOne: jest.fn(async () => product) }
  const variantsRepo = {
    find: jest.fn(async () => opts.existingVariants ?? []),
    findOne: jest.fn(async () => opts.variant ?? null),
    update: jest.fn(async () => ({ affected: 1 })),
  }
  const variantOptionsRepo = { find: jest.fn(async () => []) }
  const optionsRepo = { find: jest.fn(async () => [{ id: 'o-black', value: 'Black' }]) }

  const mVariantRepo = { create: jest.fn((i: any) => ({ id: 'v-new', ...i })), save: jest.fn(async (i: any) => i), softDelete: jest.fn(async () => ({})), count: jest.fn(async () => opts.existingVariants ? Math.max(opts.existingVariants.length - 1, 0) : 0), update: jest.fn(async () => ({})) }
  const mOptionRepo = { create: jest.fn((i: any) => i), save: jest.fn(async (i: any) => i), softDelete: jest.fn(async () => ({})) }
  const mInvRepo = {
    create: jest.fn((i: any) => i),
    save: jest.fn(async (i: any) => i),
    findOne: jest.fn(async () => (opts.variantLevelQty !== undefined ? { id: 'lvl-1', quantity: opts.variantLevelQty } : null)),
    update: jest.fn(async () => ({})),
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn(async () => ({ s: String(opts.variantStockTotal ?? 0) })),
    })),
  }
  const mMovementRepo = { count: jest.fn(async () => opts.movementHistory ?? 0), create: jest.fn((i: any) => i), save: jest.fn(async (i: any) => i) }
  const mSerialRepo = { find: jest.fn(async () => opts.inStockSerials ?? []), update: jest.fn(async () => ({})), softDelete: jest.fn(async () => ({})), count: jest.fn(async () => (opts.inStockSerials ?? []).length) }
  const mProductRepo = { update: jest.fn(async () => ({})) }

  const manager = {
    getRepository: jest.fn((e: unknown) => {
      if (e === ProductVariant) return mVariantRepo
      if (e === ProductVariantOption) return mOptionRepo
      if (e === InventoryLevel) return mInvRepo
      if (e === InventoryMovement) return mMovementRepo
      if (e === ProductSerialUnit) return mSerialRepo
      if (e === Product) return mProductRepo
      return {}
    }),
  }
  const dataSource = { transaction: jest.fn(async (cb: any) => cb(manager)) }
  const variantsService = { listVariantsForProduct: jest.fn(async () => enriched) }
  const auditService = { log: jest.fn() }
  const i18n = { translate: jest.fn(async (k: string) => k) }
  const logger = { setContext: jest.fn(), warn: jest.fn(), error: jest.fn() }

  const service = new ProductVariantManagementService(
    productsRepo as any, variantsRepo as any, variantOptionsRepo as any, optionsRepo as any,
    dataSource as any, variantsService as any, auditService as any, i18n as any, logger as any,
  )
  return { service, mVariantRepo, mOptionRepo, mInvRepo, mMovementRepo, mSerialRepo, mProductRepo, auditService, variantsService }
}

const opt = { attributeGroupId: 'g1', attributeOptionId: 'o-black' }

describe('ProductVariantManagementService', () => {
  describe('addVariant', () => {
    it('non-serialised: creates variant + level and writes a stock-in (OPENING when no history)', async () => {
      const { service, mInvRepo, mMovementRepo, auditService } = makeService({ variantStockTotal: 5, movementHistory: 0 })
      await service.addVariant('p1', 'biz-1', { name: 'Black', options: [opt], openingStock: 5 } as any, context as any)
      expect(mInvRepo.save).toHaveBeenCalledWith(expect.objectContaining({ variantId: 'v-new', quantity: 5 }))
      expect(mMovementRepo.create).toHaveBeenCalledWith(expect.objectContaining({ type: MovementType.OPENING_STOCK, quantityChange: 5, quantityBefore: 0, quantityAfter: 5 }))
      expect(auditService.log).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'CREATE', entityType: 'product_variant' }))
    })

    it('non-serialised with prior history: stock-in is a MANUAL_ADJUSTMENT', async () => {
      const { service, mMovementRepo } = makeService({ variantStockTotal: 8, movementHistory: 2 })
      await service.addVariant('p1', 'biz-1', { name: 'Blue', options: [opt], openingStock: 3 } as any, context as any)
      expect(mMovementRepo.create).toHaveBeenCalledWith(expect.objectContaining({ type: MovementType.MANUAL_ADJUSTMENT, quantityChange: 3, quantityBefore: 5, quantityAfter: 8 }))
    })

    it('serialised: creates the variant at 0 with NO movement (stock comes from serials)', async () => {
      const { service, mInvRepo, mMovementRepo } = makeService({ product: { id: 'p1', businessId: 'biz-1', trackInventory: true, isSerialized: true, hasVariants: true } })
      await service.addVariant('p1', 'biz-1', { name: 'Black', options: [opt] } as any, context as any)
      expect(mInvRepo.save).not.toHaveBeenCalled()
      expect(mMovementRepo.save).not.toHaveBeenCalled()
    })

    it('rejects a duplicate option combination', async () => {
      const { service } = makeService({ existingVariants: [{ id: 'v1' }] })
      const svc: any = service
      // existing variant v1 carries the same option (mock variantOptionsRepo on the instance)
      ;(svc as any).variantOptionsRepo.find = jest.fn(async () => [{ variantId: 'v1', attributeOptionId: 'o-black' }])
      await expect(service.addVariant('p1', 'biz-1', { name: 'Dup', options: [opt] } as any, context as any)).rejects.toMatchObject({ code: 'VARIANT_DUPLICATE_COMBINATION' })
    })
  })

  describe('updateVariant', () => {
    it('edits info with NO movement', async () => {
      const { service, mMovementRepo, auditService } = makeService({ variant: { id: 'v1', name: 'Black', isActive: true } })
      await service.updateVariant('p1', 'v1', 'biz-1', { name: 'Jet Black' } as any, context as any)
      expect(mMovementRepo.save).not.toHaveBeenCalled()
      expect(auditService.log).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'UPDATE', entityType: 'product_variant' }))
    })
  })

  describe('removeVariant', () => {
    it('non-serialised: writes off the variant level quantity (stock-out)', async () => {
      const { service, mMovementRepo, mInvRepo, auditService } = makeService({ variant: { id: 'v1', name: 'Black' }, variantStockTotal: 10, variantLevelQty: 4 })
      await service.removeVariant('p1', 'v1', 'biz-1', { reason: 'Discontinued' } as any, context as any)
      expect(mInvRepo.update).toHaveBeenCalledWith({ id: 'lvl-1' }, { quantity: 0 })
      expect(mMovementRepo.create).toHaveBeenCalledWith(expect.objectContaining({ type: MovementType.MANUAL_ADJUSTMENT, quantityChange: -4, quantityBefore: 10, quantityAfter: 6, notes: 'Discontinued' }))
      expect(auditService.log).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'DELETE', entityType: 'product_variant' }))
    })

    it('serialised: retires the variant’s IN_STOCK serial units and writes off their count', async () => {
      const { service, mSerialRepo, mMovementRepo } = makeService({
        product: { id: 'p1', businessId: 'biz-1', trackInventory: true, isSerialized: true, hasVariants: true },
        variant: { id: 'v1', name: 'Black' },
        inStockSerials: [{ id: 's1' }, { id: 's2' }],
      })
      await service.removeVariant('p1', 'v1', 'biz-1', { reason: 'Lost batch' } as any, context as any)
      expect(mSerialRepo.softDelete).toHaveBeenCalledTimes(2)
      expect(mMovementRepo.create).toHaveBeenCalledWith(expect.objectContaining({ quantityChange: -2, notes: 'Lost batch' }))
    })

    it('flips hasVariants false when the last variant is removed', async () => {
      const { service, mProductRepo } = makeService({ variant: { id: 'v1', name: 'Black' }, variantLevelQty: 0 })
      // count of remaining variants → 0 (mVariantRepo.count default is 0 when no existingVariants)
      await service.removeVariant('p1', 'v1', 'biz-1', { reason: 'cleanup' } as any, context as any)
      expect(mProductRepo.update).toHaveBeenCalledWith({ id: 'p1' }, { hasVariants: false })
    })
  })
})
