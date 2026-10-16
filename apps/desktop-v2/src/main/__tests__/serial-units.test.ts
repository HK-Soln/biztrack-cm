import { beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseService } from '@biztrack/electron-core'
import { createTestDatabase } from '@biztrack/electron-core/testing'
import { ProductsService } from '../services/products.service'

// Serial units on the till follow the server's rules (@biztrack/domain serial-units, slice
// 9): a number on hand anywhere in the business cannot be added again, a retired or sold
// number comes back on its own unit, a renamed number has its type's shape, and only an
// in-stock unit is edited or retired.

const BIZ = 'biz-1'
const NOW = '2026-10-16T12:00:00.000Z'

describe('serial units on the till', () => {
  let db: DatabaseService
  let products: ProductsService

  beforeEach(() => {
    db = createTestDatabase()
    db.run(
      `INSERT INTO unit_of_measures (id, business_id, name, abbreviation, type, is_default, is_active, is_deleted, created_at, updated_at)
       VALUES ('u1', ?, 'Piece', 'pc', 'QUANTITY', 1, 1, 0, ?, ?)`,
      [BIZ, NOW, NOW],
    )
    products = new ProductsService(
      db,
      () => BIZ,
      () => {},
    )
  })

  const serialized = (name: string) =>
    products.create({
      name,
      sellingPrice: 1000,
      unitOfMeasureId: 'u1',
      isSerialized: true,
      serialType: 'SERIAL_NUMBER',
    } as never)
  const unit = (serialNumber: string) => ({ serialNumber, serialType: 'SERIAL_NUMBER' as const })

  it('refuses a number another product has in stock', () => {
    const phone = serialized('Phone')
    const tablet = serialized('Tablet')
    products.addSerialUnits(phone.id, [unit('SN-1')])
    expect(() => products.addSerialUnits(tablet.id, [unit('SN-1')])).toThrow('already in stock')
  })

  it('brings a retired number back on its own unit', () => {
    const phone = serialized('Phone')
    const tablet = serialized('Tablet')
    const [first] = products.addSerialUnits(phone.id, [unit('SN-1')])
    products.retireSerialUnit(phone.id, first!.id, 'Broken screen')

    const [again] = products.addSerialUnits(tablet.id, [unit(' SN-1 ')])

    expect(again!.id).toBe(first!.id)
    expect(products.listSerialUnits(tablet.id).map((u) => u.serialNumber)).toEqual(['SN-1'])
  })

  it('checks the shape of a renamed number, and that it is free', () => {
    const phone = serialized('Phone')
    const [a, b] = products.addSerialUnits(phone.id, [unit('SN-1'), unit('SN-2')])
    expect(() => products.updateSerialNumber(phone.id, a!.id, 'bad number!')).toThrow(
      'not a valid serial number',
    )
    expect(() => products.updateSerialNumber(phone.id, a!.id, 'SN-2')).toThrow('already in use')
    expect(products.updateSerialNumber(phone.id, b!.id, ' SN-3 ').serialNumber).toBe('SN-3')
  })

  it('retires only with a reason', () => {
    const phone = serialized('Phone')
    const [a] = products.addSerialUnits(phone.id, [unit('SN-1')])
    expect(() => products.retireSerialUnit(phone.id, a!.id, '  ')).toThrow('reason is required')
  })
})
