import Database from 'better-sqlite3'
import { MIGRATIONS, runMigrations } from '../migrations'

export interface DatabaseServiceOptions {
  /** Absolute path to the SQLite file. The caller resolves this (Electron main
   * uses app.getPath('userData'); dev tooling uses a project-relative path). */
  path: string
  /** Open the connection read-only (e.g. a BFF read replica). Default false. */
  readonly?: boolean
  /** Run pending migrations on construction. Default true. The migration owner
   * (Electron main) keeps this true; secondary read connections pass false. */
  migrate?: boolean
}

/**
 * Thin synchronous wrapper around a better-sqlite3 connection. Renderer-agnostic
 * and Electron-agnostic — the host resolves the file path and passes it in, so the
 * same class serves the Electron main process and dev tooling. WAL mode lets
 * multiple connections share one DB file.
 */
export class DatabaseService {
  private db: Database.Database

  constructor(options: DatabaseServiceOptions) {
    this.db = new Database(options.path, { readonly: options.readonly ?? false })
    if (!options.readonly) {
      this.db.pragma('journal_mode = WAL')
    }
    this.db.pragma('foreign_keys = ON')
    if (options.migrate ?? true) {
      runMigrations(this.db, MIGRATIONS)
    }
  }

  query<T = unknown>(sql: string, params?: unknown[]): T[] {
    return this.db.prepare(sql).all(params ?? []) as T[]
  }

  get<T = unknown>(sql: string, params?: unknown[]): T | undefined {
    return this.db.prepare(sql).get(params ?? []) as T | undefined
  }

  run(sql: string, params?: unknown[]): { changes: number; lastInsertRowid: number | bigint } {
    return this.db.prepare(sql).run(params ?? [])
  }

  batch(operations: Array<{ sql: string; params?: unknown[] }>): { changes: number } {
    const transaction = this.db.transaction((steps: Array<{ sql: string; params?: unknown[] }>) => {
      let changes = 0
      for (const step of steps) {
        changes += this.db.prepare(step.sql).run(step.params ?? []).changes
      }
      return { changes }
    })

    return transaction(operations)
  }

  /** The underlying connection, for advanced callers (e.g. custom transactions). */
  get connection(): Database.Database {
    return this.db
  }

  close() {
    this.db.close()
  }
}
