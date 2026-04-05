import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { join } from 'path'
import * as dotenv from 'dotenv'
import { validateEnv } from '../config/configuration'

dotenv.config()
const env = validateEnv(process.env as Record<string, unknown>)

const entitiesPath = join(__dirname, '..', '**', '*.entity.{ts,js}').replace(/\\/g, '/')
const migrationsPath = join(__dirname, 'migrations', '*{.ts,.js}').replace(/\\/g, '/')

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: env.DATABASE_URL,
  entities: [entitiesPath],
  migrations: [migrationsPath],
  synchronize: false,
  logging: env.NODE_ENV !== 'production',
})
