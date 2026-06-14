import 'server-only'
import { join } from 'path'
import { DatabaseService } from '@biztrack/electron-core/database'
import type { DataSource } from './types'
import { ElectronSqliteDataSource } from './electron-sqlite'

export type { DataSource } from './types'

function resolveDbPath(): string {
  // Electron main exports DESKTOP_DB_PATH (userData/biztrack.db). Dev tooling and
  // `next dev` fall back to a project-relative dev DB so v2 never clobbers v1's.
  return process.env.DESKTOP_DB_PATH ?? join(process.cwd(), 'biztrack-v2-dev.db')
}

// Cache the connection across Next dev hot-reloads / route invocations.
const globalForDataSource = globalThis as unknown as { __biztrackDataSource?: DataSource }

export function getDataSource(): DataSource {
  if (!globalForDataSource.__biztrackDataSource) {
    const db = new DatabaseService({ path: resolveDbPath(), migrate: true })
    globalForDataSource.__biztrackDataSource = new ElectronSqliteDataSource(db)
  }
  return globalForDataSource.__biztrackDataSource
}
