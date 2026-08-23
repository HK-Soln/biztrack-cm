import { describe, expect, it } from 'vitest'
import { MIGRATIONS } from '../migrations'
import { createTestDatabase, withTestDatabase } from '../testing'

describe('local SQLite test harness', () => {
  it('applies every migration to a fresh in-memory database, in order', () => {
    return withTestDatabase((db) => {
      const applied = db.query<{ id: number }>('SELECT id FROM _migrations ORDER BY id')
      expect(applied.map((r) => r.id)).toEqual(MIGRATIONS.map((m) => m.id))
    })
  })

  it('creates the core tables the local-first services depend on', () => {
    return withTestDatabase((db) => {
      const names = db
        .query<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
        .map((r) => r.name)
      for (const table of [
        'sales',
        'sale_items',
        'sale_payments',
        'sale_discounts',
        'products',
        'product_variants',
        'debts',
        'debt_payments',
        'sync_outbox',
      ]) {
        expect(names, `expected table "${table}"`).toContain(table)
      }
    })
  })

  it('adds the offline PIN columns to business_members (0061)', () => {
    return withTestDatabase((db) => {
      const columns = db
        .query<{ name: string }>('PRAGMA table_info(business_members)')
        .map((c) => c.name)
      for (const col of ['pin_hash', 'pin_version', 'pin_set_at']) {
        expect(columns, `expected column "${col}"`).toContain(col)
      }
    })
  })

  it('enforces foreign keys on the connection', () => {
    return withTestDatabase((db) => {
      expect(db.get<{ foreign_keys: number }>('PRAGMA foreign_keys')?.foreign_keys).toBe(1)
    })
  })

  it('gives each createTestDatabase() call an isolated database', () => {
    const a = createTestDatabase()
    const b = createTestDatabase()
    try {
      a.run('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)', [
        'probe',
        '1',
        new Date().toISOString(),
      ])
      expect(a.get('SELECT value FROM app_settings WHERE key = ?', ['probe'])).toBeTruthy()
      expect(b.get('SELECT value FROM app_settings WHERE key = ?', ['probe'])).toBeUndefined()
    } finally {
      a.close()
      b.close()
    }
  })
})
