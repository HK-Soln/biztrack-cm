import {
  compareSyncEntityByDependency,
  type ChangeSet,
  type SyncBatchStatus,
  type SyncBatchStatusResponse,
  type SyncEntity,
  type SyncPullResponse,
  type SyncPushResponse,
  type SyncRecord,
} from '@biztrack/types'
import type { DatabaseService } from './database.service'

/**
 * Offline-first sync engine (main-process only). Owns the pull+push loop against
 * `apps/api`:
 *  - PUSH: drains `sync_outbox` → POST /sync/batches → polls batch status → clears
 *    applied rows (marks failed ones).
 *  - PULL: GET /sync/pull?cursor=… → applies server changes into local SQLite,
 *    advances the cursor.
 *
 * Storage-agnostic: the host (Electron main) injects the sync token, device id, and
 * cursor get/set so this stays renderer- and app-agnostic. Auth is the device SYNC
 * token (not the access token). Realtime (socket.io) and the settings/quality model
 * from v1 are intentionally deferred — this is the core engine the modules ride on.
 *
 * Per-entity PULL apply is added incrementally; today it covers product categories.
 * Other change arrays are accepted and ignored until their module adds an applier.
 */

export interface SyncEngineOptions {
  db: DatabaseService
  /** Same base URL the BFF uses (already includes /api/v1). */
  apiBaseUrl: string
  /** The device sync token, or null when not signed in for sync yet. */
  getSyncToken: () => string | null
  getDeviceId: () => string
  /** Pull cursor persistence (host uses the encrypted secure store). */
  getCursor: () => string | null
  setCursor: (cursor: string) => void
  onStatus?: (status: SyncStatus) => void
}

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'offline' | 'error'
  lastSyncedAt: string | null
  pendingCount: number
  /** Records waiting on a dependency to sync first (auto-retried). */
  deferredCount: number
  /** Records that errored and are backing off for retry. */
  failedCount: number
  /** Records that exhausted retries — need manual retry. */
  deadCount: number
  lastError: string | null
}

interface OutboxRow {
  id: string
  entity: string
  operation: string
  record_id: string
  payload: string | null
  updated_at: string
}

// Local outbox entity name → server SyncEntity.
const OUTBOX_ENTITY_TO_SYNC_ENTITY: Record<string, string> = {
  contacts: 'contact',
  openingBalances: 'opening_balance',
  unitOfMeasures: 'unit_of_measure',
  productCategories: 'product_category',
  expenseCategories: 'expense_category',
  products: 'product',
  inventoryThresholds: 'inventory_threshold',
  inventoryRestocks: 'inventory_restock',
  inventoryAdjustments: 'inventory_adjustment',
  debts: 'debt',
  sales: 'sale',
  expenses: 'expense',
  savings: 'savings',
  savingsTransactions: 'savings_transaction',
}

const TERMINAL_BATCH_STATUSES: SyncBatchStatus[] = [
  'completed', 'partial', 'failed', 'enqueue_failed', 'skipped',
]

const PUSH_LIMIT = 100
const BATCH_POLL_INTERVAL_MS = 800
const BATCH_POLL_TIMEOUT_MS = 30_000
const DEFAULT_INTERVAL_MS = 45_000
// Retry policy for failed records: exponential backoff up to a cap, then dead-letter.
const MAX_PUSH_ATTEMPTS = 8
const BASE_BACKOFF_MS = 5_000
const MAX_BACKOFF_MS = 60 * 60 * 1000
// 'deferred' (waiting on a dependency) retries on a short fixed delay and never dies.
const DEFERRED_RETRY_MS = 20_000

function backoffAt(attempts: number): string {
  const delay = Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MS)
  return new Date(Date.now() + delay).toISOString()
}

interface PushOperation {
  operationId: string
  entity: string
  action: 'UPSERT' | 'DELETE'
  recordId: string
  updatedAt: string
  payload: Record<string, unknown> | null
}

const asStr = (v: unknown): string | null => (v === null || v === undefined ? null : String(v))
const asNum = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))

export class SyncService {
  private timer: ReturnType<typeof setInterval> | null = null
  private running = false
  private status: SyncStatus = {
    state: 'idle',
    lastSyncedAt: null,
    pendingCount: 0,
    deferredCount: 0,
    failedCount: 0,
    deadCount: 0,
    lastError: null,
  }

  constructor(private readonly opts: SyncEngineOptions) {}

  start(intervalMs: number = DEFAULT_INTERVAL_MS): void {
    if (this.timer) return
    void this.sync()
    this.timer = setInterval(() => void this.sync(), intervalMs)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  getStatus(): SyncStatus {
    return { ...this.status, ...this.countOutbox() }
  }

  /** Manually requeue dead/failed/deferred records now (clears backoff), then sync. */
  async retryFailed(): Promise<void> {
    this.opts.db.run(
      `UPDATE sync_outbox
       SET status = 'pending', attempt_count = 0, next_attempt_at = NULL, last_error = NULL, updated_at = ?
       WHERE status IN ('dead', 'failed', 'deferred')`,
      [new Date().toISOString()],
    )
    await this.sync()
  }

  /** Run one push+pull cycle now. Safe to call concurrently — overlapping calls are ignored. */
  async sync(): Promise<void> {
    if (this.running) return
    if (!this.opts.getSyncToken()) {
      // Not signed in for sync yet — nothing to do.
      this.setStatus({ state: 'idle' })
      return
    }
    this.running = true
    this.setStatus({ state: 'syncing', lastError: null })
    try {
      await this.push()
      await this.pull()
      this.setStatus({ state: 'idle', lastSyncedAt: new Date().toISOString(), lastError: null })
    } catch (e) {
      this.setStatus({ state: 'error', lastError: e instanceof Error ? e.message : String(e) })
    } finally {
      this.running = false
    }
  }

  // ---- push ----------------------------------------------------------------

  private async push(): Promise<void> {
    // Pending + retryable (failed/deferred whose backoff has elapsed). 'dead' is never
    // auto-selected — it waits for a manual retry.
    const rows = this.opts.db.query<OutboxRow>(
      `SELECT id, entity, operation, record_id, payload, updated_at
       FROM sync_outbox
       WHERE status = 'pending'
          OR (status IN ('failed', 'deferred') AND (next_attempt_at IS NULL OR next_attempt_at <= ?))
       ORDER BY created_at ASC LIMIT ?`,
      [new Date().toISOString(), PUSH_LIMIT],
    )
    if (rows.length === 0) return

    // Hierarchical order: parents before children (from the shared dependency graph),
    // then oldest-first within an entity. The server can trust this order.
    const operations = rows
      .map((row) => this.toOperation(row))
      .filter((op): op is PushOperation => op !== null)
      .sort((a, b) => {
        const dep = compareSyncEntityByDependency(a.entity as SyncEntity, b.entity as SyncEntity)
        if (dep !== 0) return dep
        if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? -1 : 1
        return 0
      })
    if (operations.length === 0) return

    const res = await this.request<SyncPushResponse>('POST', '/sync/batches', {
      deviceId: this.opts.getDeviceId(),
      baseCursor: this.opts.getCursor(),
      operations,
    })
    if (!res.batchId) {
      throw new Error(res.lastError ?? 'Sync batch was not accepted')
    }
    const final = await this.pollBatch(res.batchId)
    this.applyBatchResults(final)
  }

  private toOperation(row: OutboxRow): PushOperation | null {
    const entity = OUTBOX_ENTITY_TO_SYNC_ENTITY[row.entity]
    if (!entity) return null
    let payload: Record<string, unknown> | null = null
    if (row.payload) {
      try {
        payload = JSON.parse(row.payload) as Record<string, unknown>
      } catch {
        payload = null
      }
    }
    return {
      operationId: row.id,
      entity,
      action: row.operation === 'DELETE' ? 'DELETE' : 'UPSERT',
      recordId: row.record_id,
      updatedAt: row.updated_at,
      payload,
    }
  }

  private async pollBatch(batchId: string): Promise<SyncBatchStatusResponse> {
    const deadline = Date.now() + BATCH_POLL_TIMEOUT_MS
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const status = await this.request<SyncBatchStatusResponse>('GET', `/sync/batches/${batchId}`)
      if (TERMINAL_BATCH_STATUSES.includes(status.status)) return status
      if (Date.now() > deadline) return status
      await new Promise((r) => setTimeout(r, BATCH_POLL_INTERVAL_MS))
    }
  }

  private applyBatchResults(batch: SyncBatchStatusResponse): void {
    const now = new Date().toISOString()
    for (const result of batch.results ?? []) {
      if (result.status === 'applied' || result.status === 'conflict') {
        this.opts.db.run('DELETE FROM sync_outbox WHERE id = ?', [result.operationId])
      } else if (result.status === 'deferred') {
        // Waiting on a dependency to sync first — keep it, retry on a short delay,
        // and don't count it as a failure (never dead-letters).
        this.opts.db.run(
          `UPDATE sync_outbox SET status = 'deferred', last_error = ?, next_attempt_at = ?, updated_at = ? WHERE id = ?`,
          [
            result.errorMessage ?? 'Waiting for a dependency',
            new Date(Date.now() + DEFERRED_RETRY_MS).toISOString(),
            now,
            result.operationId,
          ],
        )
      } else if (result.status === 'failed') {
        const row = this.opts.db.get<{ attempt_count: number }>(
          'SELECT attempt_count FROM sync_outbox WHERE id = ?',
          [result.operationId],
        )
        const attempts = (row?.attempt_count ?? 0) + 1
        if (attempts >= MAX_PUSH_ATTEMPTS) {
          // Dead-letter: stop auto-retrying; surfaced for manual retry.
          this.opts.db.run(
            `UPDATE sync_outbox SET status = 'dead', attempt_count = ?, last_error = ?, next_attempt_at = NULL, updated_at = ? WHERE id = ?`,
            [attempts, result.errorMessage ?? 'Sync failed', now, result.operationId],
          )
        } else {
          this.opts.db.run(
            `UPDATE sync_outbox SET status = 'failed', attempt_count = ?, last_error = ?, next_attempt_at = ?, updated_at = ? WHERE id = ?`,
            [attempts, result.errorMessage ?? 'Sync failed', backoffAt(attempts), now, result.operationId],
          )
        }
      }
    }
  }

  // ---- pull ----------------------------------------------------------------

  private async pull(): Promise<void> {
    const cursor = this.opts.getCursor()
    const path = cursor ? `/sync/pull?cursor=${encodeURIComponent(cursor)}` : '/sync/pull'
    const res = await this.request<SyncPullResponse>('GET', path)
    this.applyChanges(res.changes)
    if (res.cursor) this.opts.setCursor(res.cursor)
  }

  private applyChanges(changes: ChangeSet): void {
    const ops: Array<{ sql: string; params: unknown[] }> = []
    for (const record of changes.productCategories ?? []) {
      ops.push(this.categoryUpsert(record))
    }
    // NOTE: other entity arrays (products, units, inventory, …) are accepted but not
    // yet applied — each module adds its applier as it lands.
    if (ops.length > 0) this.opts.db.batch(ops)
  }

  private categoryUpsert(r: SyncRecord): { sql: string; params: unknown[] } {
    const c = r as Record<string, unknown>
    const now = new Date().toISOString()
    return {
      sql: `INSERT INTO product_categories
        (id, business_id, name, slug, color, icon, image_url, sort_order, parent_id, depth, is_active, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name, slug = excluded.slug, color = excluded.color, icon = excluded.icon,
          image_url = excluded.image_url, sort_order = excluded.sort_order, parent_id = excluded.parent_id,
          depth = excluded.depth, is_active = excluded.is_active, is_deleted = excluded.is_deleted,
          updated_at = excluded.updated_at`,
      params: [
        asStr(r.id),
        asStr(c.businessId),
        asStr(c.name),
        asStr(c.slug),
        asStr(c.color),
        asStr(c.icon),
        asStr(c.imageUrl),
        asNum(c.sortOrder) ?? 0,
        asStr(c.parentId),
        asNum(c.depth) ?? 1,
        r.isDeleted ? 0 : c.isActive === false ? 0 : 1,
        r.isDeleted ? 1 : 0,
        asStr(c.createdAt) ?? asStr(r.updatedAt) ?? now,
        asStr(r.updatedAt) ?? now,
      ],
    }
  }

  // ---- http ----------------------------------------------------------------

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = this.opts.getSyncToken()
    if (!token) throw new Error('No sync token')
    const res = await fetch(this.opts.apiBaseUrl + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Device-Type': 'DESKTOP_APP',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!res.ok) {
      throw new Error(`Sync ${method} ${path} failed (${res.status})`)
    }
    const json = (await res.json()) as { data?: T } & T
    // The API wraps successful responses in { success, data, … }.
    return (json && typeof json === 'object' && 'data' in json ? json.data : json) as T
  }

  private countOutbox(): Pick<SyncStatus, 'pendingCount' | 'deferredCount' | 'failedCount' | 'deadCount'> {
    const counts = { pendingCount: 0, deferredCount: 0, failedCount: 0, deadCount: 0 }
    try {
      const rows = this.opts.db.query<{ status: string; n: number }>(
        'SELECT status, COUNT(*) AS n FROM sync_outbox GROUP BY status',
      )
      for (const r of rows) {
        if (r.status === 'pending') counts.pendingCount = r.n
        else if (r.status === 'deferred') counts.deferredCount = r.n
        else if (r.status === 'failed') counts.failedCount = r.n
        else if (r.status === 'dead') counts.deadCount = r.n
      }
    } catch {
      /* ignore — counts default to 0 */
    }
    return counts
  }

  private setStatus(patch: Partial<SyncStatus>): void {
    this.status = { ...this.status, ...patch, ...this.countOutbox() }
    this.opts.onStatus?.(this.status)
  }
}
