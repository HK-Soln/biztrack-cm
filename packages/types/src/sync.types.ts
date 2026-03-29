export interface SyncPayload {
  deviceId: string
  businessId: string
  lastSyncedAt: string | null
  changes: ChangeSet
}

export interface SyncResponse {
  serverChanges: ChangeSet
  syncedAt: string
  conflicts: ConflictRecord[]
}

export interface ChangeSet {
  products?: SyncRecord[]
  productCategories?: SyncRecord[]
  sales?: SyncRecord[]
  saleItems?: SyncRecord[]
  expenses?: SyncRecord[]
  stockMovements?: SyncRecord[]
}

export interface SyncRecord {
  id: string
  [key: string]: unknown
  updatedAt: string
  deletedAt?: string | null
  isDeleted: boolean
}

export interface ConflictRecord {
  id: string
  entity: string
  resolution: 'server_wins' | 'client_wins'
  serverVersion: SyncRecord
  clientVersion: SyncRecord
}

export interface SyncMetadata {
  id: string
  createdAt: Date
  updatedAt: Date
  deletedAt?: Date | null
}
