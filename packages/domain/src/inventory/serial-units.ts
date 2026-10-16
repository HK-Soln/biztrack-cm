// ---------------------------------------------------------------------------
// Serial units (slice 9): a serialized product's stock is its IN_STOCK units. When a number
// may be added, brought back into stock, renamed or retired, and which variant a unit
// belongs to. The server (REST and the sync path) and the till's main process call these.
// ---------------------------------------------------------------------------

import { validateSerialNumber } from '../catalog/catalog-rules'

export type SerialUnitState = 'IN_STOCK' | 'SOLD' | 'RESERVED' | 'RETURNED' | 'DAMAGED'

/** A number held by one of these units cannot be added again: the unit is still on hand. */
export const SERIAL_ON_HAND_STATUSES: readonly SerialUnitState[] = ['IN_STOCK', 'RESERVED']

/** A unit already holding a number: its status and whether it was removed. */
export interface SerialHolder {
  id: string
  status: SerialUnitState | string
  deleted: boolean
}

export function serialOnHand(holder: Pick<SerialHolder, 'status' | 'deleted'>): boolean {
  return !holder.deleted && (SERIAL_ON_HAND_STATUSES as readonly string[]).includes(holder.status)
}

/** The numbers of a batch, trimmed, without blanks or repeats, in the order given. */
export function serialBatch<U extends { serialNumber: string }>(units: readonly U[]): U[] {
  const seen = new Set<string>()
  const out: U[] = []
  for (const unit of units) {
    const serialNumber = unit.serialNumber.trim()
    if (!serialNumber || seen.has(serialNumber)) continue
    seen.add(serialNumber)
    out.push({ ...unit, serialNumber })
  }
  return out
}

export type SerialAddRejection = 'SERIAL_INVALID_FORMAT' | 'SERIAL_DUPLICATE_IN_STOCK'

/**
 * Adding a number to stock. It must have its type's shape. A number on hand (in stock or
 * reserved) cannot be added again; a number that was sold, returned or retired comes back
 * into stock on its existing unit (numbers are unique per business), otherwise a new unit
 * is made.
 */
export function decideSerialAdd(input: {
  serialNumber: string
  serialType: string
  holder?: SerialHolder | null
}):
  | { ok: true; action: 'CREATE' }
  | { ok: true; action: 'REVIVE'; unitId: string }
  | { ok: false; code: SerialAddRejection } {
  if (!validateSerialNumber(input.serialNumber, input.serialType)) {
    return { ok: false, code: 'SERIAL_INVALID_FORMAT' }
  }
  const holder = input.holder
  if (!holder) return { ok: true, action: 'CREATE' }
  if (serialOnHand(holder)) return { ok: false, code: 'SERIAL_DUPLICATE_IN_STOCK' }
  return { ok: true, action: 'REVIVE', unitId: holder.id }
}

export type SerialEditRejection =
  | 'SERIAL_UNIT_NOT_IN_STOCK'
  | 'SERIAL_REQUIRED'
  | 'SERIAL_INVALID_FORMAT'
  | 'SERIAL_IN_USE'

/**
 * Editing a unit (its number, or its own description in unique-item mode): only while it is
 * in stock; a sold or retired unit is history. A new number is required, has its type's
 * shape and is not held by any other unit of the business, whatever that unit's status.
 */
export function checkSerialEdit(input: {
  unitId: string
  status: SerialUnitState | string
  current: string
  next?: string | null
  serialType: string
  holder?: Pick<SerialHolder, 'id'> | null
}): { ok: true; serialNumber: string } | { ok: false; code: SerialEditRejection } {
  if (input.status !== 'IN_STOCK') return { ok: false, code: 'SERIAL_UNIT_NOT_IN_STOCK' }
  if (input.next == null) return { ok: true, serialNumber: input.current }
  const serialNumber = input.next.trim()
  if (!serialNumber) return { ok: false, code: 'SERIAL_REQUIRED' }
  if (serialNumber === input.current) return { ok: true, serialNumber }
  if (!validateSerialNumber(serialNumber, input.serialType)) {
    return { ok: false, code: 'SERIAL_INVALID_FORMAT' }
  }
  if (input.holder && input.holder.id !== input.unitId) return { ok: false, code: 'SERIAL_IN_USE' }
  return { ok: true, serialNumber }
}

export type SerialRetireRejection = 'SERIAL_UNIT_NOT_IN_STOCK' | 'SERIAL_RETIRE_REASON_REQUIRED'

/** Retiring a unit (a stock-out): only an in-stock unit, and with a reason. */
export function checkSerialRetire(input: {
  status: SerialUnitState | string
  reason?: string | null
}): { ok: true; reason: string } | { ok: false; code: SerialRetireRejection } {
  if (input.status !== 'IN_STOCK') return { ok: false, code: 'SERIAL_UNIT_NOT_IN_STOCK' }
  const reason = (input.reason ?? '').trim()
  if (!reason) return { ok: false, code: 'SERIAL_RETIRE_REASON_REQUIRED' }
  return { ok: true, reason }
}

/**
 * Which variant a unit belongs to: a product with variants needs one of its own variants on
 * every unit, a product without takes none. `variantFound` is whether the given variant is
 * one of the product's live variants.
 */
export function checkSerialVariant(input: {
  hasVariants: boolean
  variantId?: string | null
  variantFound: boolean
}): 'SERIAL_VARIANT_REQUIRED' | 'SERIAL_VARIANT_INVALID' | null {
  if (input.hasVariants) {
    if (!input.variantId) return 'SERIAL_VARIANT_REQUIRED'
    return input.variantFound ? null : 'SERIAL_VARIANT_INVALID'
  }
  return input.variantId ? 'SERIAL_VARIANT_INVALID' : null
}

/**
 * The stock change a unit's new state makes (+1 entering stock, −1 leaving it, 0 when it
 * stays in or out), for the movement recorded with it.
 */
export function serialStockChange(
  before: { status: SerialUnitState | string; deleted: boolean } | null,
  after: { status: SerialUnitState | string; deleted: boolean },
): -1 | 0 | 1 {
  const was = before != null && !before.deleted && before.status === 'IN_STOCK'
  const is = !after.deleted && after.status === 'IN_STOCK'
  return was === is ? 0 : is ? 1 : -1
}
