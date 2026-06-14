// The BFF never imports a concrete data store directly — it depends on this
// interface. The Electron build binds the `electron-sqlite` adapter (offline-first
// local SQLite); a future cloud build binds a `cloud-api` adapter that hits the
// NestJS API. Swapping runtimes never touches the BFF query/command modules.
export interface DataSource {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>
  get<T = unknown>(sql: string, params?: unknown[]): Promise<T | undefined>
  run(sql: string, params?: unknown[]): Promise<{ changes: number; lastInsertRowid: number | bigint }>
  batch(operations: Array<{ sql: string; params?: unknown[] }>): Promise<{ changes: number }>
  // enqueueOutbox / triggerSync arrive with the sync milestone.
}
