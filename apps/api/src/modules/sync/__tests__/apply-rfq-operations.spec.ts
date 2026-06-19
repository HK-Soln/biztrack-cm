/// <reference types="jest" />
import { SyncService } from '../sync.service'

const recordUpdatedAt = new Date('2026-06-18T00:00:00.000Z')

const makeService = (existing: unknown) => {
  const rfqsRepo = {
    findOne: jest.fn().mockResolvedValue(existing),
    update: jest.fn(),
    save: jest.fn(async (e) => e),
    create: jest.fn((e) => e),
    softDelete: jest.fn(),
  }
  const rfqItemsRepo = { delete: jest.fn(), save: jest.fn(async (e) => e), create: jest.fn((e) => e) }
  const rfqSuppliersRepo = { delete: jest.fn(), save: jest.fn(async (e) => e), create: jest.fn((e) => e) }
  const service = Object.create(SyncService.prototype) as any
  service.rfqsRepo = rfqsRepo
  service.rfqItemsRepo = rfqItemsRepo
  service.rfqSuppliersRepo = rfqSuppliersRepo
  return { service, rfqsRepo, rfqItemsRepo, rfqSuppliersRepo }
}

const payload = {
  number: 'RFQ-00001',
  title: 'Q3 restock',
  status: 'QUOTED',
  currency: 'XAF',
  items: [{ id: 'it-1', productId: 'p-1', description: 'iPhone', quantity: 5 }],
  suppliers: [{ id: 'rs-1', supplierId: 'c-1', status: 'QUOTED', quotedTotal: 50000 }],
}

describe('SyncService.applyRfqOperation', () => {
  it('creates an RFQ and full-replaces its items + suppliers', async () => {
    const { service, rfqsRepo, rfqItemsRepo, rfqSuppliersRepo } = makeService(null)
    const result = await service.applyRfqOperation('biz-1', {
      recordId: 'rfq-1',
      action: 'UPSERT',
      recordUpdatedAt,
      payload,
    } as any)
    expect(result.status).toBe('applied')
    expect(rfqsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'rfq-1', businessId: 'biz-1', number: 'RFQ-00001', status: 'QUOTED' }),
    )
    expect(rfqItemsRepo.delete).toHaveBeenCalledWith({ rfqId: 'rfq-1' })
    expect(rfqItemsRepo.save).toHaveBeenCalledTimes(1)
    expect(rfqSuppliersRepo.delete).toHaveBeenCalledWith({ rfqId: 'rfq-1' })
    expect(rfqSuppliersRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'rs-1', supplierId: 'c-1', status: 'QUOTED', quotedTotal: 50000 }),
    )
  })

  it('server-wins when the incoming RFQ is not newer', async () => {
    const { service, rfqsRepo } = makeService({
      id: 'rfq-1',
      businessId: 'biz-1',
      updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    })
    const result = await service.applyRfqOperation('biz-1', {
      recordId: 'rfq-1',
      action: 'UPSERT',
      recordUpdatedAt,
      payload,
    } as any)
    expect(result).toEqual({ status: 'conflict', resolution: 'server_wins' })
    expect(rfqsRepo.update).not.toHaveBeenCalled()
  })
})
