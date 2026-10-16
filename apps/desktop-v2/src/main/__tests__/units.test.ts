import { beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseService } from '@biztrack/electron-core'
import { createTestDatabase } from '@biztrack/electron-core/testing'
import { UnitsService } from '../services/units.service'

// Ruling R12: the till applies the server's unit-of-measure rules (@biztrack/domain) before
// it saves, so a unit it syncs is never one the server refuses.

const BIZ = 'biz-1'
const NOW = '2026-10-16T08:00:00.000Z'

describe('UnitsService — unit rules (R12)', () => {
  let db: DatabaseService
  let units: UnitsService

  beforeEach(() => {
    db = createTestDatabase()
    units = new UnitsService(
      db,
      () => BIZ,
      () => {},
    )
  })

  it('stores the name in capitals and syncs it as a business unit, never a default one', () => {
    const unit = units.create({ name: ' Cuvette ', abbreviation: ' cuv ', type: 'CUSTOM' })
    expect(unit).toMatchObject({ name: 'CUVETTE', abbreviation: 'cuv', isDefault: false })
    const payload = JSON.parse(
      db.get<{ payload: string }>(
        `SELECT payload FROM sync_outbox WHERE entity = 'unitOfMeasures' AND record_id = ?`,
        [unit.id],
      )!.payload,
    )
    expect(payload).toMatchObject({ name: 'CUVETTE', abbreviation: 'cuv', isDefault: false })
  })

  it('refuses a name the business already has, whatever its case', () => {
    units.create({ name: 'Cuvette', abbreviation: 'cuv', type: 'CUSTOM' })
    expect(() => units.create({ name: 'cuvette', abbreviation: 'c', type: 'CUSTOM' })).toThrow(
      'You already have a unit with this name.',
    )
  })

  it('lets a unit keep its own name on edit, but not take another unit’s', () => {
    const bag = units.create({ name: 'Bag', abbreviation: 'bg', type: 'QUANTITY' })
    units.create({ name: 'Sack', abbreviation: 'sk', type: 'QUANTITY' })
    expect(units.update(bag.id, { name: 'bag', abbreviation: 'bag', type: 'QUANTITY' }).name).toBe(
      'BAG',
    )
    expect(() => units.update(bag.id, { name: 'SACK', abbreviation: 'sk' })).toThrow(
      'You already have a unit with this name.',
    )
  })

  it('refuses an empty or over-long name', () => {
    expect(() => units.create({ name: '  ', abbreviation: '' })).toThrow('A unit needs a name.')
    expect(() => units.create({ name: 'Bag', abbreviation: 'x'.repeat(11) })).toThrow(
      'An abbreviation is at most 10 characters.',
    )
  })

  it('does not touch a default unit, even one held by the business', () => {
    db.run(
      `INSERT INTO unit_of_measures (id, business_id, name, abbreviation, type, is_default, is_active, is_deleted, created_at, updated_at)
       VALUES ('u-def', ?, 'PIECE', 'pcs', 'QUANTITY', 1, 1, 0, ?, ?)`,
      [BIZ, NOW, NOW],
    )
    expect(() => units.update('u-def', { name: 'Pieces', abbreviation: 'pc' })).toThrow(
      'System units cannot be modified.',
    )
    expect(() => units.remove('u-def')).toThrow('System units cannot be modified.')
  })

  it('deletes a unit only once no product uses it', () => {
    const bag = units.create({ name: 'Bag', abbreviation: 'bg', type: 'QUANTITY' })
    db.run(
      `INSERT INTO products (id, business_id, name, price, unit_of_measure_id, created_at, updated_at)
       VALUES ('p-1', ?, 'Rice', 1000, ?, ?, ?)`,
      [BIZ, bag.id, NOW, NOW],
    )
    expect(() => units.remove(bag.id)).toThrow('still used')
    db.run(`UPDATE products SET is_deleted = 1 WHERE id = 'p-1'`)
    units.remove(bag.id)
    expect(units.list().data.find((u) => u.id === bag.id)).toBeUndefined()
  })
})
