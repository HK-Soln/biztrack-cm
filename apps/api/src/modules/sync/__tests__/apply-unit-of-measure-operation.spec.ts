/// <reference types="jest" />
import { SyncService } from '../sync.service'

// applyUnitOfMeasureOperation only touches `this.unitsRepo` and, for a delete, a product
// count, so we bypass the (30+ dep) constructor and wire just those.
const makeService = (
  existing: unknown,
  { others = [] as Array<{ id: string; name: string }>, productCount = 0 } = {},
) => {
  const unitsRepo = {
    findOne: jest.fn().mockResolvedValue(existing),
    find: jest.fn().mockResolvedValue(others),
    update: jest.fn(),
    save: jest.fn(),
    create: jest.fn((v: unknown) => v),
  }
  const service = Object.create(SyncService.prototype) as any
  service.unitsRepo = unitsRepo
  service.dataSource = { manager: { count: jest.fn().mockResolvedValue(productCount) } }
  return { service, unitsRepo }
}

const operation = {
  recordId: 'unit-1',
  action: 'UPSERT',
  recordUpdatedAt: new Date('2026-06-01T00:00:00.000Z'),
  payload: { name: 'Carton', abbreviation: 'ctn', businessId: 'biz-attacker' },
} as any

const OLD = new Date('2020-01-01T00:00:00.000Z')

describe('SyncService.applyUnitOfMeasureOperation tenant isolation', () => {
  it('rejects an UPSERT targeting a unit owned by another business', async () => {
    const { service, unitsRepo } = makeService({
      id: 'unit-1',
      businessId: 'biz-2',
      updatedAt: OLD,
    })

    const result = await service.applyUnitOfMeasureOperation('biz-1', operation)

    expect(result.status).toBe('failed')
    expect(result.errorMessage).toMatch(/another business/i)
    expect(unitsRepo.update).not.toHaveBeenCalled()
    expect(unitsRepo.save).not.toHaveBeenCalled()
  })

  it('rejects an UPSERT targeting a system (null-business) unit', async () => {
    const { service, unitsRepo } = makeService({
      id: 'unit-1',
      businessId: null,
      updatedAt: OLD,
    })

    const result = await service.applyUnitOfMeasureOperation('biz-1', operation)

    expect(result.status).toBe('failed')
    expect(result.errorMessage).toMatch(/pull-only/i)
    expect(unitsRepo.update).not.toHaveBeenCalled()
    expect(unitsRepo.save).not.toHaveBeenCalled()
  })

  it("allows an operation on the caller's own unit (falls through to conflict check)", async () => {
    const { service } = makeService({
      id: 'unit-1',
      businessId: 'biz-1',
      updatedAt: new Date('2026-12-01T00:00:00.000Z'), // newer than operation → server wins
    })

    const result = await service.applyUnitOfMeasureOperation('biz-1', operation)

    expect(result.status).toBe('conflict')
    expect(result.resolution).toBe('server_wins')
  })
})

// Ruling R12: the sync path applies the same unit rules as the server's own path.
describe('SyncService.applyUnitOfMeasureOperation — unit rules (R12)', () => {
  const upsert = (payload: Record<string, unknown>) => ({ ...operation, payload })

  it('stores a new unit as the domain does, never as a default one', async () => {
    const { service, unitsRepo } = makeService(null)

    await service.applyUnitOfMeasureOperation(
      'biz-1',
      upsert({ name: ' cuvette ', abbreviation: 'cuv', type: 'CUSTOM', isDefault: true }),
    )

    expect(unitsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'CUVETTE', businessId: 'biz-1', isDefault: false }),
    )
  })

  it('refuses a name the business already has', async () => {
    const { service, unitsRepo } = makeService(null, {
      others: [{ id: 'unit-2', name: 'CUVETTE' }],
    })

    await expect(
      service.applyUnitOfMeasureOperation(
        'biz-1',
        upsert({ name: 'Cuvette', abbreviation: 'cuv', type: 'CUSTOM' }),
      ),
    ).rejects.toMatchObject({ code: 'UNIT_OF_MEASURE_EXISTS' })
    expect(unitsRepo.save).not.toHaveBeenCalled()
  })

  it('refuses a unit without a valid type', async () => {
    const { service } = makeService(null)

    await expect(
      service.applyUnitOfMeasureOperation('biz-1', upsert({ name: 'Cuvette', type: 'AREA' })),
    ).rejects.toMatchObject({ code: 'UNIT_OF_MEASURE_TYPE_INVALID' })
  })

  it('refuses to change a default unit', async () => {
    const { service, unitsRepo } = makeService({
      id: 'unit-1',
      businessId: 'biz-1',
      isDefault: true,
      updatedAt: OLD,
    })

    await expect(
      service.applyUnitOfMeasureOperation(
        'biz-1',
        upsert({ name: 'Pieces', abbreviation: 'pc', type: 'QUANTITY' }),
      ),
    ).rejects.toMatchObject({ code: 'UNIT_OF_MEASURE_SYSTEM_IMMUTABLE' })
    expect(unitsRepo.update).not.toHaveBeenCalled()
  })

  it('refuses to delete a unit a product still uses', async () => {
    const { service, unitsRepo } = makeService(
      { id: 'unit-1', businessId: 'biz-1', isDefault: false, updatedAt: OLD },
      { productCount: 2 },
    )

    await expect(
      service.applyUnitOfMeasureOperation('biz-1', { ...operation, action: 'DELETE' }),
    ).rejects.toMatchObject({ code: 'UNIT_OF_MEASURE_IN_USE' })
    expect(unitsRepo.update).not.toHaveBeenCalled()
  })

  it('deletes a unit no product uses', async () => {
    const { service, unitsRepo } = makeService({
      id: 'unit-1',
      businessId: 'biz-1',
      isDefault: false,
      updatedAt: OLD,
    })

    const result = await service.applyUnitOfMeasureOperation('biz-1', {
      ...operation,
      action: 'DELETE',
    })

    expect(result.status).toBe('applied')
    expect(unitsRepo.update).toHaveBeenCalledWith(
      'unit-1',
      expect.objectContaining({ isActive: false }),
    )
  })
})
