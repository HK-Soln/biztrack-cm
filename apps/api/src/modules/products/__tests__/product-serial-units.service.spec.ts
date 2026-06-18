/// <reference types="jest" />
import { MovementType } from '@/entities/inventory-movement.entity'
import { InventoryMovement } from '@/entities/inventory-movement.entity'
import { ProductSerialUnit } from '@/entities/product-serial-unit.entity'
import { ProductSerialUnitsService } from '../services/product-serial-units.service'

// Stock for a serialised product is the count of IN_STOCK units, so adding a unit
// writes a stock-in movement and retiring one writes a stock-out movement, while
// correcting a serial number writes NO movement. Every mutation is audited. We
// exercise the service with mocked repos + a pass-through transaction.

const context = {
  businessId: 'biz-1',
  actorId: 'user-1',
  actorType: 'BUSINESS_USER' as const,
  actorName: 'Ada',
  actorRole: 'OWNER',
  ipAddress: null,
  deviceId: 'dev-1',
  deviceType: 'DESKTOP_APP' as const,
  deviceInfo: null,
  requestId: null,
}

function makeService(opts: {
  product?: any
  existingBySerial?: Record<string, any>
  inStockCount?: number
  movementCount?: number
  unit?: any
  variant?: any
} = {}) {
  const product = opts.product ?? { id: 'p1', businessId: 'biz-1', isSerialized: true, hasVariants: false, serialType: 'SERIAL_NUMBER' }
  const productsRepo = { findOne: jest.fn(async () => product) }

  const serialRepo = {
    findOne: jest.fn(async ({ where }: any) => {
      if (where.id) return opts.unit ?? null
      return opts.existingBySerial?.[where.serialNumber] ?? null
    }),
    count: jest.fn(async () => opts.inStockCount ?? 0),
    create: jest.fn((input: unknown) => ({ id: 'new-unit', ...(input as object) })),
    save: jest.fn(async (input: any) => input),
    update: jest.fn(async () => ({ affected: 1 })),
    softDelete: jest.fn(async () => ({ affected: 1 })),
    findAndCount: jest.fn(async () => [[], 0]),
  }
  const movementRepo = {
    count: jest.fn(async () => opts.movementCount ?? 0),
    create: jest.fn((input: unknown) => input),
    save: jest.fn(async (input: unknown) => input),
  }
  const variantsRepo = { findOne: jest.fn(async () => opts.variant ?? null) }

  const manager = {
    getRepository: jest.fn((entity: unknown) =>
      entity === InventoryMovement ? movementRepo : serialRepo,
    ),
  }
  const dataSource = { transaction: jest.fn(async (cb: any) => cb(manager)) }
  const auditService = { log: jest.fn() }
  const i18n = { translate: jest.fn(async (key: string) => key) }
  const logger = { setContext: jest.fn(), warn: jest.fn(), error: jest.fn() }

  const service = new ProductSerialUnitsService(
    productsRepo as any,
    serialRepo as any,
    variantsRepo as any,
    movementRepo as any,
    dataSource as any,
    auditService as any,
    i18n as any,
    logger as any,
  )
  return { service, productsRepo, serialRepo, movementRepo, variantsRepo, auditService }
}

describe('ProductSerialUnitsService', () => {
  describe('add', () => {
    it('adds units and writes an OPENING_STOCK movement when there is no prior history', async () => {
      const { service, serialRepo, movementRepo, auditService } = makeService({ inStockCount: 0, movementCount: 0 })
      const created = await service.add('p1', 'biz-1', { units: [{ serialNumber: 'SN-A', serialType: 'SERIAL_NUMBER' }, { serialNumber: 'SN-B', serialType: 'SERIAL_NUMBER' }] } as any, context as any)
      expect(created).toHaveLength(2)
      expect(serialRepo.save).toHaveBeenCalledTimes(2)
      expect(movementRepo.save).toHaveBeenCalledTimes(1)
      expect(movementRepo.create).toHaveBeenCalledWith(expect.objectContaining({ type: MovementType.OPENING_STOCK, quantityChange: 2, quantityBefore: 0, quantityAfter: 2 }))
      expect(auditService.log).toHaveBeenCalledTimes(2)
    })

    it('writes a MANUAL_ADJUSTMENT (stock-in) when history already exists', async () => {
      const { service, movementRepo } = makeService({ inStockCount: 3, movementCount: 1 })
      await service.add('p1', 'biz-1', { units: [{ serialNumber: 'SN-C', serialType: 'SERIAL_NUMBER' }] } as any, context as any)
      expect(movementRepo.create).toHaveBeenCalledWith(expect.objectContaining({ type: MovementType.MANUAL_ADJUSTMENT, quantityChange: 1, quantityBefore: 3, quantityAfter: 4 }))
    })

    it('rejects a serial already in stock', async () => {
      const { service } = makeService({ existingBySerial: { 'SN-DUP': { id: 'u1', status: 'IN_STOCK', deletedAt: null } } })
      await expect(service.add('p1', 'biz-1', { units: [{ serialNumber: 'SN-DUP', serialType: 'SERIAL_NUMBER' }] } as any, context as any)).rejects.toMatchObject({ code: 'SERIAL_DUPLICATE_IN_STOCK' })
    })

    it('revives a previously retired (soft-deleted) unit instead of inserting', async () => {
      const { service, serialRepo } = makeService({ existingBySerial: { 'SN-OLD': { id: 'u9', status: 'DAMAGED', deletedAt: new Date() } } })
      serialRepo.findOne.mockImplementation(async ({ where }: any) => {
        if (where.id === 'u9') return { id: 'u9', serialNumber: 'SN-OLD', status: 'IN_STOCK' }
        if (where.serialNumber) return { id: 'u9', status: 'DAMAGED', deletedAt: new Date() }
        return null
      })
      const created = await service.add('p1', 'biz-1', { units: [{ serialNumber: 'SN-OLD', serialType: 'SERIAL_NUMBER' }] } as any, context as any)
      expect(serialRepo.update).toHaveBeenCalled()
      expect(serialRepo.save).not.toHaveBeenCalled()
      expect(created).toHaveLength(1)
    })

    it('requires a variant when the product has variants', async () => {
      const { service } = makeService({ product: { id: 'p1', businessId: 'biz-1', isSerialized: true, hasVariants: true, serialType: 'SERIAL_NUMBER' } })
      await expect(service.add('p1', 'biz-1', { units: [{ serialNumber: 'SN-A', serialType: 'SERIAL_NUMBER' }] } as any, context as any)).rejects.toMatchObject({ code: 'SERIAL_VARIANT_REQUIRED' })
    })

    it('throws when the product is not serialised', async () => {
      const { service } = makeService({ product: { id: 'p1', businessId: 'biz-1', isSerialized: false } })
      await expect(service.add('p1', 'biz-1', { units: [{ serialNumber: 'SN-A', serialType: 'SERIAL_NUMBER' }] } as any, context as any)).rejects.toMatchObject({ code: 'PRODUCT_NOT_SERIALIZED' })
    })
  })

  describe('retire', () => {
    it('retires an in-stock unit, writes a -1 stock-out movement and audits with the reason', async () => {
      const { service, serialRepo, movementRepo, auditService } = makeService({ inStockCount: 5, unit: { id: 'u1', productId: 'p1', businessId: 'biz-1', serialNumber: 'SN-A', status: 'IN_STOCK' } })
      await service.retire('p1', 'u1', 'biz-1', { reason: 'Damaged in transit' } as any, context as any)
      expect(serialRepo.softDelete).toHaveBeenCalled()
      expect(movementRepo.create).toHaveBeenCalledWith(expect.objectContaining({ type: MovementType.MANUAL_ADJUSTMENT, quantityChange: -1, quantityBefore: 5, quantityAfter: 4, notes: 'Damaged in transit' }))
      expect(auditService.log).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'DELETE', entityType: 'product_serial_unit' }))
    })

    it('refuses to retire a sold unit', async () => {
      const { service } = makeService({ unit: { id: 'u1', productId: 'p1', businessId: 'biz-1', serialNumber: 'SN-A', status: 'SOLD' } })
      await expect(service.retire('p1', 'u1', 'biz-1', { reason: 'whatever' } as any, context as any)).rejects.toMatchObject({ code: 'SERIAL_UNIT_NOT_IN_STOCK' })
    })
  })

  describe('updateSerialNumber', () => {
    it('corrects a serial number WITHOUT writing a movement', async () => {
      const { service, movementRepo, serialRepo, auditService } = makeService({ unit: { id: 'u1', productId: 'p1', businessId: 'biz-1', serialNumber: 'SN-OLD', status: 'IN_STOCK' } })
      await service.updateSerialNumber('p1', 'u1', 'biz-1', { serialNumber: 'SN-NEW' } as any, context as any)
      expect(serialRepo.update).toHaveBeenCalledWith({ id: 'u1' }, { serialNumber: 'SN-NEW' })
      expect(movementRepo.save).not.toHaveBeenCalled()
      expect(auditService.log).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'UPDATE' }))
    })
  })
})
