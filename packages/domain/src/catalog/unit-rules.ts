// ---------------------------------------------------------------------------
// What a unit of measure may be (ruling R12). The server's REST path, its sync path and the
// till apply the same checks before saving. System units (no business) and default units
// are the server's: a business can neither edit nor delete them, nor mark its own unit as a
// default. A business's unit names are unique, compared without case, counting deleted
// units too because the database index does.
// ---------------------------------------------------------------------------

export const UNIT_NAME_MAX_LENGTH = 50
export const UNIT_ABBREVIATION_MAX_LENGTH = 10
export const UNIT_TYPES = ['QUANTITY', 'WEIGHT', 'VOLUME', 'LENGTH', 'CUSTOM'] as const
export type UnitTypeCode = (typeof UNIT_TYPES)[number]

export type UnitRejection =
  | 'UNIT_OF_MEASURE_NAME_REQUIRED'
  | 'UNIT_OF_MEASURE_NAME_TOO_LONG'
  | 'UNIT_OF_MEASURE_ABBREVIATION_TOO_LONG'
  | 'UNIT_OF_MEASURE_TYPE_INVALID'
  | 'UNIT_OF_MEASURE_EXISTS'

/** A unit name as stored: trimmed and in capitals, so "kg " and "KG" are the same name. */
export function normalizeUnitName(name: string | null | undefined): string {
  return (name ?? '').trim().toUpperCase()
}

/**
 * The unit as it will be stored, or why it cannot be. `takenNames` are the business's other
 * units (deleted ones included), as stored or as typed.
 */
export function decideUnit(input: {
  name: string | null | undefined
  abbreviation?: string | null
  type: string | null | undefined
  takenNames?: readonly string[]
}):
  | { ok: true; name: string; abbreviation: string; type: UnitTypeCode }
  | { ok: false; code: UnitRejection } {
  const name = normalizeUnitName(input.name)
  if (!name) return { ok: false, code: 'UNIT_OF_MEASURE_NAME_REQUIRED' }
  if (name.length > UNIT_NAME_MAX_LENGTH)
    return { ok: false, code: 'UNIT_OF_MEASURE_NAME_TOO_LONG' }
  const abbreviation = (input.abbreviation ?? '').trim()
  if (abbreviation.length > UNIT_ABBREVIATION_MAX_LENGTH) {
    return { ok: false, code: 'UNIT_OF_MEASURE_ABBREVIATION_TOO_LONG' }
  }
  const type = (input.type ?? '').toUpperCase() as UnitTypeCode
  if (!UNIT_TYPES.includes(type)) return { ok: false, code: 'UNIT_OF_MEASURE_TYPE_INVALID' }
  if ((input.takenNames ?? []).some((taken) => normalizeUnitName(taken) === name)) {
    return { ok: false, code: 'UNIT_OF_MEASURE_EXISTS' }
  }
  return { ok: true, name, abbreviation, type }
}

/** A system unit (no business) or a default unit cannot be edited or deleted by a business. */
export function checkUnitEditable(unit: {
  businessId?: string | null
  isDefault: boolean
}): 'UNIT_OF_MEASURE_SYSTEM_IMMUTABLE' | null {
  return !unit.businessId || unit.isDefault ? 'UNIT_OF_MEASURE_SYSTEM_IMMUTABLE' : null
}

/** A unit is deleted only once no product uses it. */
export function checkUnitRemoval(productCount: number): 'UNIT_OF_MEASURE_IN_USE' | null {
  return productCount > 0 ? 'UNIT_OF_MEASURE_IN_USE' : null
}
