import { describe, expect, it } from 'vitest'
import { withTestDatabase } from '@biztrack/electron-core/testing'

// Proves the shared local-SQLite harness is usable from the desktop app's own
// test target (same Electron-ABI runtime, same migrated schema). Real
// main-process service tests build on this fixture in later stories.
describe('desktop-v2 local database harness', () => {
  it('boots a migrated in-memory database and round-trips a row', () => {
    return withTestDatabase((db) => {
      db.run('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)', [
        'harness.smoke',
        'ok',
        new Date().toISOString(),
      ])
      const row = db.get<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', [
        'harness.smoke',
      ])
      expect(row?.value).toBe('ok')
    })
  })
})
