import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { join } from 'path'
import * as dotenv from 'dotenv'

dotenv.config()

const entitiesPath = join(__dirname, '..', '**', '*.entity.{ts,js}').replace(/\\/g, '/')

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Configure apps/admin-api/.env before seeding.')
}

/**
 * Standalone DataSource for admin scripts (e.g. seeding). Migrations are owned by
 * apps/api, so this source declares none.
 */
export const AdminDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [entitiesPath],
  migrations: [],
  synchronize: false,
  logging: false,
})
