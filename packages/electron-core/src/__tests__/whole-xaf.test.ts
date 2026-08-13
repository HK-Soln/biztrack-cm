import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { MIGRATIONS, runMigrations } from '../migrations'
import { migration_0060 } from '../migrations/0060_whole_xaf_money'
import { createTestDatabase } from '../testing'

// The whole-XAF migration (0060) rounds legacy fractional money and installs
// guard triggers. Foreign keys are turned off so the fixtures can insert a lone
// sale_payments row without standing up a whole sale graph.

const INSERT_PAYMENT =
  'INSERT INTO sale_payments (id, sale_id, business_id, method, amount, created_at) VALUES (?, ?, ?, ?, ?, ?)'

describe('0060 whole-XAF enforcement', () => {
  it('rejects an INSERT with a fractional money amount', () => {
    const db = createTestDatabase()
    db.connection.pragma('foreign_keys = OFF')
    try {
      expect(() => db.run(INSERT_PAYMENT, ['p1', 's1', 'b1', 'CASH', 100.5, 't'])).toThrowError(
        /whole XAF/,
      )
    } finally {
      db.close()
    }
  })

  it('accepts an INSERT with a whole money amount, and rejects updating it to a fraction', () => {
    const db = createTestDatabase()
    db.connection.pragma('foreign_keys = OFF')
    try {
      db.run(INSERT_PAYMENT, ['p1', 's1', 'b1', 'CASH', 100, 't'])
      expect(
        db.get<{ amount: number }>('SELECT amount FROM sale_payments WHERE id = ?', ['p1']),
      ).toEqual({ amount: 100 })
      expect(() =>
        db.run('UPDATE sale_payments SET amount = ? WHERE id = ?', [100.25, 'p1']),
      ).toThrowError(/whole XAF/)
    } finally {
      db.close()
    }
  })
})

describe('0060 legacy-data rounding', () => {
  it('rounds pre-existing fractional money to whole XAF when the migration runs', () => {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = OFF')
    try {
      // Bring the schema up to just before the whole-XAF migration, then seed a
      // fractional row the way the old 2-decimal storage would have.
      runMigrations(
        db,
        MIGRATIONS.filter((m) => m.id <= 59),
      )
      db.prepare(INSERT_PAYMENT).run('p1', 's1', 'b1', 'CASH', 100.5, 't')

      migration_0060.up(db)

      const row = db.prepare('SELECT amount FROM sale_payments WHERE id = ?').get('p1') as {
        amount: number
      }
      expect(row.amount).toBe(101) // 100.5 rounds half away from zero
      // …and the guard is now live.
      expect(() => db.prepare(INSERT_PAYMENT).run('p2', 's1', 'b1', 'CASH', 5.5, 't')).toThrow()
    } finally {
      db.close()
    }
  })
})
