import 'server-only'
// Import the DB module via its subpath — NOT the barrel — so the Next server never
// transitively loads the electron-importing services (secure-store/network).
import { DatabaseService } from '@biztrack/electron-core/database'
import type { DataSource } from './types'

// Offline-first adapter: reads/writes the local SQLite mirror. better-sqlite3 is
// synchronous, so the async DataSource methods simply wrap the sync calls.
//
// Skeleton note: this opens its own connection by path (with migrate:true, which is
// idempotent). When the sync engine lands, the prod in-process server will instead
// reuse the single shared DatabaseService owned by Electron main so all writes
// serialize on one connection.
export class ElectronSqliteDataSource implements DataSource {
  constructor(private readonly db: DatabaseService) {}

  async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    return this.db.query<T>(sql, params)
  }

  async get<T = unknown>(sql: string, params?: unknown[]): Promise<T | undefined> {
    return this.db.get<T>(sql, params)
  }

  async run(sql: string, params?: unknown[]) {
    return this.db.run(sql, params)
  }

  async batch(operations: Array<{ sql: string; params?: unknown[] }>) {
    return this.db.batch(operations)
  }
}
