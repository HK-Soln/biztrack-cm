import { describe, expect, it } from 'vitest'
import { checkUnitEditable, checkUnitRemoval, decideUnit, normalizeUnitName } from './unit-rules'

describe('decideUnit', () => {
  it('stores the name trimmed and in capitals, the abbreviation trimmed', () => {
    expect(decideUnit({ name: ' Cuvette ', abbreviation: ' cuv ', type: 'custom' })).toEqual({
      ok: true,
      name: 'CUVETTE',
      abbreviation: 'cuv',
      type: 'CUSTOM',
    })
  })

  it('allows an empty abbreviation', () => {
    expect(decideUnit({ name: 'Bag', type: 'QUANTITY' })).toMatchObject({
      ok: true,
      abbreviation: '',
    })
  })

  it('refuses a missing or long name, a long abbreviation and an unknown type', () => {
    expect(decideUnit({ name: '  ', type: 'QUANTITY' })).toEqual({
      ok: false,
      code: 'UNIT_OF_MEASURE_NAME_REQUIRED',
    })
    expect(decideUnit({ name: 'x'.repeat(51), type: 'QUANTITY' })).toEqual({
      ok: false,
      code: 'UNIT_OF_MEASURE_NAME_TOO_LONG',
    })
    expect(decideUnit({ name: 'Bag', abbreviation: 'x'.repeat(11), type: 'QUANTITY' })).toEqual({
      ok: false,
      code: 'UNIT_OF_MEASURE_ABBREVIATION_TOO_LONG',
    })
    expect(decideUnit({ name: 'Bag', type: 'AREA' })).toEqual({
      ok: false,
      code: 'UNIT_OF_MEASURE_TYPE_INVALID',
    })
  })

  it('refuses a name the business already has, whatever its case', () => {
    expect(decideUnit({ name: 'cuvette', type: 'CUSTOM', takenNames: ['CUVETTE'] })).toEqual({
      ok: false,
      code: 'UNIT_OF_MEASURE_EXISTS',
    })
  })
})

describe('unit edits and deletes', () => {
  it('leaves system and default units alone', () => {
    expect(checkUnitEditable({ businessId: null, isDefault: true })).toBe(
      'UNIT_OF_MEASURE_SYSTEM_IMMUTABLE',
    )
    expect(checkUnitEditable({ businessId: 'b', isDefault: true })).toBe(
      'UNIT_OF_MEASURE_SYSTEM_IMMUTABLE',
    )
    expect(checkUnitEditable({ businessId: 'b', isDefault: false })).toBeNull()
  })

  it('deletes a unit only once no product uses it', () => {
    expect(checkUnitRemoval(2)).toBe('UNIT_OF_MEASURE_IN_USE')
    expect(checkUnitRemoval(0)).toBeNull()
  })

  it('normalizes names', () => {
    expect(normalizeUnitName(' kg ')).toBe('KG')
    expect(normalizeUnitName(null)).toBe('')
  })
})
