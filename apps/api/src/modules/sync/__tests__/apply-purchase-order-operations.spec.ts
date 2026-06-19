/// <reference types="jest" />
import { SyncService } from '../sync.service'

const recordUpdatedAt = new Date('2026-06-18T00:00:00.000Z')

const makeService = (existing: unknown) => {
  const purchaseOrdersRepo = {
    findOne: jest.fn().mockResolvedValue(existing),
    update: jest.fn(),
    save: jest.fn(async (e) => e),
    create: jest.fn((e) => e),
    softDelete: jest.fn(),
  }
  const purchaseOrderItemsRepo = { delete: jest.fn(), save: jest.fn(async (e) => e), create: jest.fn((e) => e) }
  const service = Object.create(SyncService.prototype) as any
  service.purchaseOrdersRepo = purchaseOrdersRepo
  service.purchaseOrderItemsRepo = purchaseOrderItemsRepo
  service.normalizeOptionalString = (v: unknown) => (v == null || v === '' ? null : v)
  service.parseOptionalDate = (v: unknown) => (v ? new Date(v as string) : null)
  return { service, purchaseOrdersRepo, purchaseOrderItemsRepo }
}

const payload = {
  number: 'PO-00001',
  supplierId: 'c-1',
  status: 'SENT',
  currency: 'XAF',
  totalAmount: 2300000,
  rfqId: 'rfq-1',
  items: [{ id: 'it-1', productId: 'p-1', description: 'iPhone', quantity: 5, unitPrice: 450000, receivedQuantity: 0 }],
}

describe('SyncService.applyPurchaseOrderOperation', () => {
  it('creates a PO and full-replaces its items', async () => {
    const { service, purchaseOrdersRepo, purchaseOrderItemsRepo } = makeService(null)
    const result = await service.applyPurchaseOrderOperation('biz-1', {
      recordId: 'po-1',
      action: 'UPSERT',
      recordUpdatedAt,
      payload,
    } as any)
    expect(result.status).toBe('applied')
    expect(purchaseOrdersRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'po-1', businessId: 'biz-1', number: 'PO-00001', status: 'SENT', rfqId: 'rfq-1', totalAmount: 2300000 }),
    )
    expect(purchaseOrderItemsRepo.delete).toHaveBeenCalledWith({ purchaseOrderId: 'po-1' })
    expect(purchaseOrderItemsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'it-1', purchaseOrderId: 'po-1', unitPrice: 450000 }),
    )
  })

  it('server-wins when the incoming PO is not newer', async () => {
    const { service, purchaseOrdersRepo } = makeService({
      id: 'po-1',
      businessId: 'biz-1',
      updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    })
    const result = await service.applyPurchaseOrderOperation('biz-1', {
      recordId: 'po-1',
      action: 'UPSERT',
      recordUpdatedAt,
      payload,
    } as any)
    expect(result).toEqual({ status: 'conflict', resolution: 'server_wins' })
    expect(purchaseOrdersRepo.update).not.toHaveBeenCalled()
  })
})
