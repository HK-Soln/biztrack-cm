/// <reference types="jest" />
import { SyncService } from '../sync.service'

// Slice 9: a till's stock adjustment is replayed on the server's level with the same domain
// decision the till made (@biztrack/domain decideStockAdjustment and
// checkStockAdjustmentTarget). The applier only touches the repos wired here.
const makeService = ({
  product = { id: 'p-1', trackInventory: true, isSerialized: false } as Record<string, unknown>,
  hasVariants = false,
  level = 5,
} = {}) => {
  const levelRepo = {
    findOne: jest.fn().mockResolvedValue({ id: 'lvl-1', quantity: level }),
    save: jest.fn(),
    create: jest.fn((v: unknown) => v),
    update: jest.fn(),
  }
  const movementRepo = { save: jest.fn(), create: jest.fn((v: unknown) => v) }
  const service = Object.create(SyncService.prototype) as any
  service.productsRepo = { findOne: jest.fn().mockResolvedValue(product) }
  service.inventoryMovementsRepo = { findOne: jest.fn().mockResolvedValue(null) }
  service.productVariantsRepo = { exists: jest.fn().mockResolvedValue(hasVariants) }
  service.calendar = { resolveForSync: jest.fn().mockResolvedValue('2026-10-16') }
  service.dataSource = {
    transaction: (cb: (m: unknown) => unknown) =>
      cb({
        getRepository: (entity: { name: string }) =>
          entity.name === 'InventoryLevel' ? levelRepo : movementRepo,
      }),
  }
  return { service, levelRepo, movementRepo }
}

const op = (payload: Record<string, unknown>) =>
  ({
    recordId: 'mv-1',
    action: 'UPSERT',
    recordUpdatedAt: new Date('2026-10-16T08:00:00.000Z'),
    payload: { productId: 'p-1', ...payload },
  }) as any

describe('SyncService.applyInventoryAdjustmentOperation (slice 9)', () => {
  it('applies the adjustment to the server level', async () => {
    const { service, levelRepo, movementRepo } = makeService({ level: 5 })

    const result = await service.applyInventoryAdjustmentOperation(
      'biz-1',
      op({ type: 'ADD', quantity: 3, notes: ' recount ' }),
    )

    expect(result.status).toBe('applied')
    expect(levelRepo.update).toHaveBeenCalledWith('lvl-1', expect.objectContaining({ quantity: 8 }))
    expect(movementRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        quantityBefore: 5,
        quantityAfter: 8,
        quantityChange: 3,
        notes: 'recount',
        type: 'MANUAL_ADJUSTMENT',
      }),
    )
  })

  it('reports a conflict when the server has less stock than the removal', async () => {
    const { service, levelRepo } = makeService({ level: 1 })

    const result = await service.applyInventoryAdjustmentOperation(
      'biz-1',
      op({ type: 'REMOVE', quantity: 3, notes: 'broken' }),
    )

    expect(result).toMatchObject({ status: 'conflict', resolution: 'server_wins' })
    expect(levelRepo.update).not.toHaveBeenCalled()
  })

  it('refuses what the till would have refused', async () => {
    const { service, levelRepo } = makeService()

    const noReason = await service.applyInventoryAdjustmentOperation(
      'biz-1',
      op({ type: 'ADD', quantity: 1, notes: ' x ' }),
    )
    const zero = await service.applyInventoryAdjustmentOperation(
      'biz-1',
      op({ type: 'ADD', quantity: 0, notes: 'count' }),
    )

    expect(noReason).toMatchObject({ status: 'failed' })
    expect(noReason.errorMessage).toMatch(/STOCK_REASON_REQUIRED/)
    expect(zero.errorMessage).toMatch(/STOCK_QUANTITY_NOT_POSITIVE/)
    expect(levelRepo.update).not.toHaveBeenCalled()
  })

  it("refuses an adjustment of a serialized product's own level", async () => {
    const { service, levelRepo } = makeService({
      product: { id: 'p-1', trackInventory: true, isSerialized: true },
    })

    const result = await service.applyInventoryAdjustmentOperation(
      'biz-1',
      op({ type: 'ADD', quantity: 1, notes: 'count' }),
    )

    expect(result.status).toBe('failed')
    expect(result.errorMessage).toMatch(/STOCK_SERIALIZED/)
    expect(levelRepo.update).not.toHaveBeenCalled()
  })
})
