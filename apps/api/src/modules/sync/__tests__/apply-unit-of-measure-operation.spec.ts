/// <reference types="jest" />
import { SyncService } from '../sync.service'

// applyUnitOfMeasureOperation's tenant-ownership guards return before touching
// anything other than `this.unitsRepo`, so we bypass the (30+ dep) constructor
// and wire just that repo.
const makeService = (existing: unknown) => {
  const unitsRepo = { findOne: jest.fn().mockResolvedValue(existing), update: jest.fn(), save: jest.fn(), create: jest.fn() }
  const service = Object.create(SyncService.prototype) as any
  service.unitsRepo = unitsRepo
  return { service, unitsRepo }
}

const operation = {
  recordId: 'unit-1',
  action: 'UPSERT',
  recordUpdatedAt: new Date('2026-06-01T00:00:00.000Z'),
  payload: { name: 'Carton', abbreviation: 'ctn', businessId: 'biz-attacker' },
} as any

describe('SyncService.applyUnitOfMeasureOperation tenant isolation', () => {
  it('rejects an UPSERT targeting a unit owned by another business', async () => {
    const { service, unitsRepo } = makeService({
      id: 'unit-1',
      businessId: 'biz-2',
      updatedAt: new Date('2020-01-01T00:00:00.000Z'),
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
      updatedAt: new Date('2020-01-01T00:00:00.000Z'),
    })

    const result = await service.applyUnitOfMeasureOperation('biz-1', operation)

    expect(result.status).toBe('failed')
    expect(result.errorMessage).toMatch(/pull-only/i)
    expect(unitsRepo.update).not.toHaveBeenCalled()
    expect(unitsRepo.save).not.toHaveBeenCalled()
  })

  it('allows an operation on the caller\'s own unit (falls through to conflict check)', async () => {
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
