import { DatabaseService } from '@biztrack/electron-core'

export interface SkeletonCheck {
  value: string
  checkedAt: string
}

export interface SkeletonHealth {
  ok: boolean
  productCount: number
  skeletonValue: string | null
  source: 'local-sqlite'
}

/**
 * Walking-skeleton domain service. Lives in the MAIN process (the trusted BFF):
 * it owns the SQLite read logic; the renderer only calls it over typed IPC and
 * never sees raw SQL. Real domain services (products, sales, …) follow this shape.
 */
export class SkeletonService {
  constructor(private readonly db: DatabaseService) {}

  /** Ensure the dev marker table/row exists so the skeleton always has data. */
  ensureSeed(): void {
    this.db.run(
      `CREATE TABLE IF NOT EXISTS _skeleton_check (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         value TEXT NOT NULL,
         checked_at TEXT NOT NULL
       )`,
    )
    const existing = this.db.get<{ count: number }>('SELECT COUNT(*) AS count FROM _skeleton_check')
    if (!existing || existing.count === 0) {
      this.db.run('INSERT INTO _skeleton_check (value, checked_at) VALUES (?, ?)', [
        'skeleton OK — read from local SQLite',
        new Date().toISOString(),
      ])
    }
  }

  getCheck(): SkeletonCheck | null {
    try {
      const row = this.db.get<{ value: string; checked_at: string }>(
        'SELECT value, checked_at FROM _skeleton_check ORDER BY id DESC LIMIT 1',
      )
      return row ? { value: row.value, checkedAt: row.checked_at } : null
    } catch {
      return null
    }
  }

  getHealth(): SkeletonHealth {
    const products = this.db.get<{ count: number }>('SELECT COUNT(*) AS count FROM products')
    const check = this.getCheck()
    return {
      ok: true,
      productCount: products?.count ?? 0,
      skeletonValue: check?.value ?? null,
      source: 'local-sqlite',
    }
  }
}
