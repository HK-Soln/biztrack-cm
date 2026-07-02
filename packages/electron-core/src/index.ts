// @biztrack/electron-core — renderer-agnostic main-process services shared by the
// desktop apps: local SQLite (with migrations), encrypted secure store, and network
// quality probing. The sync engine will be added here in a later milestone.

export { DatabaseService } from './services/database.service'
export type { DatabaseServiceOptions } from './services/database.service'
export { SecureStoreService } from './services/secure-store.service'
export { NetworkService } from './services/network.service'
export { SyncService } from './services/sync.service'
export type { SyncEngineOptions, SyncStatus } from './services/sync.service'
export { RealtimeClient, REALTIME_PATH } from './services/realtime.service'
export type { RealtimeClientOptions } from './services/realtime.service'
export { MIGRATIONS, runMigrations, ensureColumn } from './migrations'
export type { Migration } from './migrations'
