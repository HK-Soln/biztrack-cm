import { DatabaseService } from '../services/database.service'

// ---------------------------------------------------------------------------
// Test fixtures for local-first services. Shared by @biztrack/electron-core's
// own tests and by apps/desktop-v2 (imported as `@biztrack/electron-core/testing`),
// so every consumer of the local SQLite layer tests against the real schema
// produced by the real migrations — never a hand-maintained mock.
//
// These helpers touch the native better-sqlite3 module, so any test that uses
// them must run under the Electron-ABI runtime (see the package `test` script).
// ---------------------------------------------------------------------------

/**
 * Open a fresh in-memory SQLite database with every migration applied. Each call
 * returns an isolated database with nothing shared between tests; the `:memory:`
 * database is discarded when the connection closes (or is garbage-collected).
 */
export function createTestDatabase(): DatabaseService {
  return new DatabaseService({ path: ':memory:' })
}

/**
 * Run `fn` against a fresh in-memory database and guarantee the connection is
 * closed afterwards, even if the assertion throws. Returns whatever `fn` returns.
 */
export async function withTestDatabase<T>(fn: (db: DatabaseService) => T | Promise<T>): Promise<T> {
  const db = createTestDatabase()
  try {
    return await fn(db)
  } finally {
    db.close()
  }
}
