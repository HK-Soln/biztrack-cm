import { describe, expect, it } from 'vitest'
import {
  checkSerialEdit,
  checkSerialRetire,
  checkSerialVariant,
  decideSerialAdd,
  serialBatch,
  serialOnHand,
  serialStockChange,
} from './serial-units'

describe('serialBatch', () => {
  it('trims and drops blanks and repeats', () => {
    expect(
      serialBatch([
        { serialNumber: ' A1 ' },
        { serialNumber: '' },
        { serialNumber: 'A1' },
        { serialNumber: 'B2' },
      ]),
    ).toEqual([{ serialNumber: 'A1' }, { serialNumber: 'B2' }])
  })
})

describe('decideSerialAdd', () => {
  it('makes a new unit for a new number', () => {
    expect(decideSerialAdd({ serialNumber: 'SN-1', serialType: 'SERIAL_NUMBER' })).toEqual({
      ok: true,
      action: 'CREATE',
    })
  })

  it('refuses a number on hand, in stock or reserved', () => {
    for (const status of ['IN_STOCK', 'RESERVED']) {
      expect(
        decideSerialAdd({
          serialNumber: 'SN-1',
          serialType: 'SERIAL_NUMBER',
          holder: { id: 'u1', status, deleted: false },
        }),
      ).toEqual({ ok: false, code: 'SERIAL_DUPLICATE_IN_STOCK' })
    }
  })

  it('brings a sold, returned or retired number back on its unit', () => {
    expect(
      decideSerialAdd({
        serialNumber: 'SN-1',
        serialType: 'SERIAL_NUMBER',
        holder: { id: 'u1', status: 'SOLD', deleted: false },
      }),
    ).toEqual({ ok: true, action: 'REVIVE', unitId: 'u1' })
    expect(
      decideSerialAdd({
        serialNumber: 'SN-1',
        serialType: 'SERIAL_NUMBER',
        holder: { id: 'u1', status: 'IN_STOCK', deleted: true },
      }),
    ).toEqual({ ok: true, action: 'REVIVE', unitId: 'u1' })
  })

  it('checks the shape first', () => {
    expect(decideSerialAdd({ serialNumber: '123', serialType: 'IMEI' })).toEqual({
      ok: false,
      code: 'SERIAL_INVALID_FORMAT',
    })
  })
})

describe('checkSerialEdit', () => {
  const base = { unitId: 'u1', status: 'IN_STOCK', current: 'SN-1', serialType: 'SERIAL_NUMBER' }
  it('edits an in-stock unit only', () => {
    expect(checkSerialEdit({ ...base, status: 'SOLD', next: 'SN-2' })).toEqual({
      ok: false,
      code: 'SERIAL_UNIT_NOT_IN_STOCK',
    })
    expect(checkSerialEdit({ ...base })).toEqual({ ok: true, serialNumber: 'SN-1' })
  })
  it('checks a new number: given, shaped, not held by another unit', () => {
    expect(checkSerialEdit({ ...base, next: '  ' })).toEqual({ ok: false, code: 'SERIAL_REQUIRED' })
    expect(checkSerialEdit({ ...base, next: 'bad number!' })).toEqual({
      ok: false,
      code: 'SERIAL_INVALID_FORMAT',
    })
    expect(checkSerialEdit({ ...base, next: 'SN-2', holder: { id: 'u2' } })).toEqual({
      ok: false,
      code: 'SERIAL_IN_USE',
    })
    expect(checkSerialEdit({ ...base, next: ' SN-2 ' })).toEqual({ ok: true, serialNumber: 'SN-2' })
  })
})

describe('checkSerialRetire', () => {
  it('retires an in-stock unit with a reason', () => {
    expect(checkSerialRetire({ status: 'IN_STOCK', reason: ' broken ' })).toEqual({
      ok: true,
      reason: 'broken',
    })
    expect(checkSerialRetire({ status: 'SOLD', reason: 'x' })).toEqual({
      ok: false,
      code: 'SERIAL_UNIT_NOT_IN_STOCK',
    })
    expect(checkSerialRetire({ status: 'IN_STOCK', reason: ' ' })).toEqual({
      ok: false,
      code: 'SERIAL_RETIRE_REASON_REQUIRED',
    })
  })
})

describe('checkSerialVariant', () => {
  it('needs one of the product variants when it has them, none otherwise', () => {
    expect(checkSerialVariant({ hasVariants: true, variantFound: false })).toBe(
      'SERIAL_VARIANT_REQUIRED',
    )
    expect(checkSerialVariant({ hasVariants: true, variantId: 'v', variantFound: false })).toBe(
      'SERIAL_VARIANT_INVALID',
    )
    expect(checkSerialVariant({ hasVariants: true, variantId: 'v', variantFound: true })).toBeNull()
    expect(checkSerialVariant({ hasVariants: false, variantId: 'v', variantFound: true })).toBe(
      'SERIAL_VARIANT_INVALID',
    )
    expect(checkSerialVariant({ hasVariants: false, variantFound: false })).toBeNull()
  })
})

describe('serialStockChange and serialOnHand', () => {
  it('counts a unit entering or leaving stock', () => {
    expect(serialStockChange(null, { status: 'IN_STOCK', deleted: false })).toBe(1)
    expect(
      serialStockChange({ status: 'IN_STOCK', deleted: false }, { status: 'SOLD', deleted: false }),
    ).toBe(-1)
    expect(
      serialStockChange({ status: 'SOLD', deleted: false }, { status: 'IN_STOCK', deleted: false }),
    ).toBe(1)
    expect(
      serialStockChange(
        { status: 'IN_STOCK', deleted: false },
        { status: 'IN_STOCK', deleted: false },
      ),
    ).toBe(0)
    expect(serialOnHand({ status: 'RESERVED', deleted: false })).toBe(true)
    expect(serialOnHand({ status: 'SOLD', deleted: false })).toBe(false)
  })
})
