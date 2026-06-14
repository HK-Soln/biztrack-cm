/// <reference types="jest" />
import { SerialUnitStatus } from '@biztrack/types'
import { ProductSerialUnit } from '@/entities/product-serial-unit.entity'
import { InventoryService } from '../services/inventory.service'

// restockSerialUnits creates one serial_unit row per valid serial number, rejects
// bad formats and in-stock duplicates per-serial (collecting errors rather than
// failing the whole restock), and re-stocks previously sold/returned units. We
// exercise it directly with a mocked EntityManager. SERIAL_NUMBER type is used so
// validity is plain alphanumerics (no Luhn) — IMEI/Luhn is covered by imei-validator.spec.

function makeService(existingBySerial: Record<string, Partial<ProductSerialUnit>> = {}) {
  const serialRepo = {
    findOne: jest.fn(async ({ where }: any) => existingBySerial[where.serialNumber] ?? null),
    update: jest.fn(async () => ({ affected: 1 })),
    create: jest.fn((input: unknown) => input),
    save: jest.fn(async (input: unknown) => input),
  }
  const manager = { getRepository: jest.fn(() => serialRepo) } as any
  const i18n = { translate: jest.fn(async (key: string) => key) }
  const logger = { setContext: jest.fn(), warn: jest.fn(), error: jest.fn() }
  const service = new InventoryService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    i18n as any,
    logger as any,
  )
  return { service: service as any, serialRepo, manager }
}

const product = (over: any = {}) => ({
  id: 'p1',
  businessId: 'biz-1',
  name: 'Phone',
  serialType: 'SERIAL_NUMBER',
  warrantyMonths: null,
  ...over,
})

const input = { businessId: 'biz-1', createdAt: new Date('2026-01-01'), supplierId: null } as any

const restock = (service: any, manager: any, item: any, prod: any) =>
  service.restockSerialUnits(manager, item, prod, input, 'restock-1')

describe('InventoryService.restockSerialUnits (Phase 6)', () => {
  it('creates one serial unit per valid serial number', async () => {
    const { service, serialRepo, manager } = makeService()
    const result = await restock(service, manager, { serialNumbers: ['SN-A', 'SN-B'] }, product())
    expect(result.created).toBe(2)
    expect(result.errors).toHaveLength(0)
    expect(serialRepo.save).toHaveBeenCalledTimes(2)
  })

  it('rejects an invalid serial format with INVALID_FORMAT (and keeps the valid ones)', async () => {
    const { service, manager } = makeService()
    const result = await restock(service, manager, { serialNumbers: ['bad serial!', 'SN-OK'] }, product())
    expect(result.created).toBe(1)
    expect(result.errors).toEqual([{ serialNumber: 'bad serial!', reason: 'INVALID_FORMAT' }])
  })

  it('rejects a duplicate that is already IN_STOCK', async () => {
    const { service, manager } = makeService({
      'SN-DUP': { id: 'u1', status: SerialUnitStatus.IN_STOCK } as any,
    })
    const result = await restock(service, manager, { serialNumbers: ['SN-DUP'] }, product())
    expect(result.created).toBe(0)
    expect(result.errors).toEqual([{ serialNumber: 'SN-DUP', reason: 'DUPLICATE_IN_STOCK' }])
  })

  it('re-stocks a previously SOLD unit back to IN_STOCK', async () => {
    const { service, serialRepo, manager } = makeService({
      'SN-SOLD': { id: 'u1', status: SerialUnitStatus.SOLD } as any,
    })
    const result = await restock(service, manager, { serialNumbers: ['SN-SOLD'] }, product())
    expect(result.created).toBe(1)
    expect(result.errors).toHaveLength(0)
    expect(serialRepo.update).toHaveBeenCalledWith(
      { id: 'u1' },
      expect.objectContaining({ status: SerialUnitStatus.IN_STOCK, saleId: null }),
    )
  })

  it('deduplicates repeated serials within the same batch', async () => {
    const { service, serialRepo, manager } = makeService()
    const result = await restock(service, manager, { serialNumbers: ['SN-X', 'SN-X'] }, product())
    expect(result.created).toBe(1)
    expect(serialRepo.save).toHaveBeenCalledTimes(1)
  })

  it('sets variantId on created serial units for serialised variants', async () => {
    const { service, serialRepo, manager } = makeService()
    await restock(service, manager, { serialNumbers: ['SN-V'], variantId: 'var-1' }, product())
    expect(serialRepo.create).toHaveBeenCalledWith(expect.objectContaining({ variantId: 'var-1' }))
  })
})
