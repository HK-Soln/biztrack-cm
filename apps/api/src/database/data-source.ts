import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { join } from 'path'
import * as dotenv from 'dotenv'
dotenv.config()

const entitiesPath = join(__dirname, '..', '**', '*.entity.{ts,js}').replace(/\\/g, '/')
const migrationsPath = join(__dirname, 'migrations', '*{.ts,.js}').replace(/\\/g, '/')

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [entitiesPath],
  migrations: [migrationsPath],
  synchronize: false,
  logging: true,
})
