import 'reflect-metadata'
import { join } from 'path'
import * as dotenv from 'dotenv'
import { Client } from 'pg'
import { DataSource } from 'typeorm'

// ---------------------------------------------------------------------------
// A real Postgres for integration tests. Unit specs mock the database; these tests
// exist for the paths where the SQL and the transaction are the thing under test
// (a sale synced from a till, its refund, its void).
//
// The database is `TEST_DATABASE_URL` when set, else the `DATABASE_URL` server with
// `_integration_test` appended to the database name. It is created on first use and
// every migration is applied, so the schema is exactly what production gets. The
// name must end in `_test`: these tests write freely and must never see real data.
// ---------------------------------------------------------------------------

dotenv.config()

const SUFFIX = '_integration_test'

export function integrationDatabaseUrl(): string {
  const explicit = process.env.TEST_DATABASE_URL?.trim()
  const base = process.env.DATABASE_URL?.trim()
  if (!explicit && !base) {
    throw new Error('Integration tests need TEST_DATABASE_URL or DATABASE_URL.')
  }
  const url = new URL(explicit || base!)
  if (!explicit) url.pathname = `${url.pathname.replace(/\/$/, '')}${SUFFIX}`
  const name = decodeURIComponent(url.pathname.replace(/^\//, ''))
  if (!name.endsWith('_test')) {
    throw new Error(
      `Refusing to run integration tests against "${name}": the database name must end in "_test".`,
    )
  }
  return url.toString()
}

async function ensureDatabaseExists(url: string): Promise<void> {
  const target = new URL(url)
  const name = decodeURIComponent(target.pathname.replace(/^\//, ''))
  const admin = new URL(url)
  admin.pathname = '/postgres'
  const client = new Client({ connectionString: admin.toString() })
  await client.connect()
  try {
    const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name])
    if (existing.rowCount === 0) {
      await client.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`)
    }
  } finally {
    await client.end()
  }
}

let shared: Promise<DataSource> | null = null

/** The migrated integration database, opened once per test run. */
export function getIntegrationDataSource(): Promise<DataSource> {
  shared ??= (async () => {
    const url = integrationDatabaseUrl()
    await ensureDatabaseExists(url)
    const dataSource = new DataSource({
      type: 'postgres',
      url,
      entities: [join(__dirname, '..', '**', '*.entity.{ts,js}').replace(/\\/g, '/')],
      migrations: [
        join(__dirname, '..', 'database', 'migrations', '*{.ts,.js}').replace(/\\/g, '/'),
      ],
      synchronize: false,
      logging: false,
    })
    await dataSource.initialize()
    await dataSource.runMigrations()
    return dataSource
  })()
  return shared
}

export async function closeIntegrationDataSource(): Promise<void> {
  if (!shared) return
  const dataSource = await shared
  shared = null
  if (dataSource.isInitialized) await dataSource.destroy()
}
