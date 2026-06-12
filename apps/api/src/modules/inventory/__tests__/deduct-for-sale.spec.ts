/// <reference types="jest" />
import { AppBadRequestException } from '@/common/exceptions/app-exceptions'
import { InventoryService } from '../services/inventory.service'

// deductForSale (called without a manager) uses the top-level productsRepo,
// inventoryLevelsRepo and inventoryMovementsRepo. We mock just those.
const makeService = (opts: {
  products: Array<{ id: string; trackInventory: boolean }>
  levels: Array<{ id: string; productId: string; quantity: number }>
}) => {
  const productsRepo = { find: jest.fn().mockResolvedValue(opts.products) }

  const levelsQb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    setLock: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(opts.levels),
  }
  const inventoryLevelsRepo = {
    createQueryBuilder: jest.fn(() => levelsQb),
    manager: { queryRunner: null },
    update: jest.fn(),
    save: jest.fn(async (input: unknown) => input),
    create: jest.fn((input: unknown) => input),
  }
  const inventoryMovementsRepo = {
    create: jest.fn((input: unknown) => input),
    save: jest.fn(async (input: unknown) => input),
  }
  const i18n = { translate: jest.fn(async (key: string) => key) }
  const logger = { setContext: jest.fn(), warn: jest.fn(), error: jest.fn() }

  const service = new InventoryService(
    {} as any,
    {} as any,
    productsRepo as any,
    inventoryLevelsRepo as any,
    inventoryMovementsRepo as any,
    {} as any,
    {} as any,
    i18n as any,
    logger as any,
  )

  return { service, productsRepo, inventoryLevelsRepo, inventoryMovementsRepo, levelsQb }
}

const item = (productId: string, quantity: number) => ({
  productId,
  productName: productId,
  quantity,
})

describe('InventoryService.deductForSale (batched)', () => {
  it('loads products and levels once regardless of line-item count', async () => {
    const { service, productsRepo, levelsQb } = makeService({
      products: [{ id: 'p1', trackInventory: true }],
      levels: [{ id: 'lvl-1', productId: 'p1', quantity: 10 }],
    })

    await service.deductForSale('biz-1', 'sale-1', 'S-001', 'user-1', [item('p1', 1), item('p1', 2)])

    expect(productsRepo.find).toHaveBeenCalledTimes(1)
    expect(levelsQb.getMany).toHaveBeenCalledTimes(1)
  })

  it('deducts cumulatively across repeated line items for the same product', async () => {
    const { service, inventoryLevelsRepo, inventoryMovementsRepo } = makeService({
      products: [{ id: 'p1', trackInventory: true }],
      levels: [{ id: 'lvl-1', productId: 'p1', quantity: 10 }],
    })

    await service.deductForSale('biz-1', 'sale-1', 'S-001', 'user-1', [item('p1', 3), item('p1', 4)])

    // one bulk movement insert, with correct running before/after per line
    expect(inventoryMovementsRepo.save).toHaveBeenCalledTimes(1)
    const movements = inventoryMovementsRepo.save.mock.calls[0][0] as Array<any>
    expect(movements).toHaveLength(2)
    expect(movements[0]).toMatchObject({ quantityBefore: 10, quantityAfter: 7, quantityChange: -3 })
    expect(movements[1]).toMatchObject({ quantityBefore: 7, quantityAfter: 3, quantityChange: -4 })

    // level written once with the final running quantity
    expect(inventoryLevelsRepo.update).toHaveBeenCalledTimes(1)
    expect(inventoryLevelsRepo.update).toHaveBeenCalledWith('lvl-1', { quantity: 3 })
  })

  it('skips non-inventory-tracked products entirely', async () => {
    const { service, inventoryLevelsRepo, inventoryMovementsRepo } = makeService({
      products: [{ id: 'svc', trackInventory: false }],
      levels: [],
    })

    await service.deductForSale('biz-1', 'sale-1', 'S-001', 'user-1', [item('svc', 5)])

    expect(inventoryMovementsRepo.save).not.toHaveBeenCalled()
    expect(inventoryLevelsRepo.update).not.toHaveBeenCalled()
    expect(inventoryLevelsRepo.save).not.toHaveBeenCalled()
  })

  it('rejects when cumulative deduction would drive stock negative', async () => {
    const { service } = makeService({
      products: [{ id: 'p1', trackInventory: true }],
      levels: [{ id: 'lvl-1', productId: 'p1', quantity: 5 }],
    })

    await expect(
      service.deductForSale('biz-1', 'sale-1', 'S-001', 'user-1', [item('p1', 3), item('p1', 4)]),
    ).rejects.toBeInstanceOf(AppBadRequestException)
  })
})
