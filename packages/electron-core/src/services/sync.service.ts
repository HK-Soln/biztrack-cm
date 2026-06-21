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
  attributeGroups: 'attribute_group',
  attributeOptions: 'attribute_option',
  categoryAttributeGroups: 'category_attribute_group',
  brands: 'brand',
  models: 'model',
  brandCategories: 'brand_category',
  productImages: 'product_image',
  productVariants: 'product_variant',
  productVariantOptions: 'product_variant_option',
  productSerialUnits: 'product_serial_unit',
  expenseCategories: 'expense_category',
  products: 'product',
  inventoryThresholds: 'inventory_threshold',
  inventoryRestocks: 'inventory_restock',
  inventoryAdjustments: 'inventory_adjustment',
  debts: 'debt',
  rfqs: 'rfq',
  purchaseOrders: 'purchase_order',
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
    // Contacts are tier-0 roots (suppliers/customers) — apply before anything that
    // references them.
    for (const record of changes.contacts ?? []) {
      ops.push(this.contactUpsert(record))
    }
    // Opening balances depend on the contact — applied right after.
    for (const record of changes.openingBalances ?? []) {
      ops.push(this.openingBalanceUpsert(record))
    }
    for (const record of changes.productCategories ?? []) {
      ops.push(this.categoryUpsert(record))
    }
    // Apply parents before children so a fresh device satisfies local FKs in one pass.
    for (const record of changes.attributeGroups ?? []) {
      ops.push(this.attributeGroupUpsert(record))
    }
    for (const record of changes.attributeOptions ?? []) {
      ops.push(this.attributeOptionUpsert(record))
    }
    for (const record of changes.categoryAttributeGroups ?? []) {
      ops.push(this.categoryAttributeGroupUpsert(record))
    }
    for (const record of changes.unitOfMeasures ?? []) {
      ops.push(this.unitOfMeasureUpsert(record))
    }
    // Parents before children: brands → models + brand-category links.
    for (const record of changes.brands ?? []) {
      ops.push(this.brandUpsert(record))
    }
    for (const record of changes.models ?? []) {
      ops.push(this.modelUpsert(record))
    }
    for (const record of changes.brandCategories ?? []) {
      ops.push(this.brandCategoryUpsert(record))
    }
    // Products depend on category/unit/brand/model — applied after them.
    for (const record of changes.products ?? []) {
      ops.push(this.productUpsert(record))
    }
    for (const record of changes.productImages ?? []) {
      ops.push(this.productImageUpsert(record))
    }
    for (const record of changes.productVariants ?? []) {
      ops.push(this.productVariantUpsert(record))
    }
    for (const record of changes.productVariantOptions ?? []) {
      ops.push(this.productVariantOptionUpsert(record))
    }
    for (const record of changes.productSerialUnits ?? []) {
      ops.push(this.productSerialUnitUpsert(record))
    }
    // Expense categories (tier 0) before expenses (tier 2) that reference them.
    for (const record of changes.expenseCategories ?? []) {
      ops.push(this.expenseCategoryUpsert(record))
    }
    for (const record of changes.expenses ?? []) {
      ops.push(this.expenseUpsert(record))
    }
    // Deposit sessions (depend on contact) + their transactions.
    for (const record of changes.savingsAccounts ?? []) {
      ops.push(this.savingsAccountUpsert(record))
    }
    for (const record of changes.savingsTransactions ?? []) {
      ops.push(this.savingsTransactionUpsert(record))
    }
    // NOTE: other entity arrays (products, units, inventory, …) are accepted but not
    // yet applied — each module adds its applier as it lands.
    if (ops.length > 0) this.opts.db.batch(ops)
  }

  private contactUpsert(r: SyncRecord): { sql: string; params: unknown[] } {
    const c = r as Record<string, unknown>
    const now = new Date().toISOString()
    return {
      sql: `INSERT INTO contacts
        (id, business_id, type, name, phone, phone_alt, address, notes, is_active, created_by_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          type = excluded.type, name = excluded.name, phone = excluded.phone,
          phone_alt = excluded.phone_alt, address = excluded.address, notes = excluded.notes,
          is_active = excluded.is_active, updated_at = excluded.updated_at`,
      params: [
        asStr(r.id),
        asStr(c.businessId),
        asStr(c.type),
        asStr(c.name),
        asStr(c.phone),
        asStr(c.phoneAlt),
        asStr(c.address),
        asStr(c.notes),
        r.isDeleted ? 0 : c.isActive === false ? 0 : 1,
        asStr(c.createdById),
        asStr(c.createdAt) ?? asStr(r.updatedAt) ?? now,
        asStr(r.updatedAt) ?? now,
      ],
    }
  }

  private openingBalanceUpsert(r: SyncRecord): { sql: string; params: unknown[] } {
    const o = r as Record<string, unknown>
    const now = new Date().toISOString()
    return {
      sql: `INSERT INTO contact_opening_balances
        (id, business_id, contact_id, direction, amount, as_of_date, notes, recorded_by_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(business_id, contact_id, direction) DO UPDATE SET
          amount = excluded.amount, as_of_date = excluded.as_of_date, notes = excluded.notes,
          recorded_by_id = excluded.recorded_by_id, updated_at = excluded.updated_at`,
      params: [
        asStr(r.id),
        asStr(o.businessId),
        asStr(o.contactId),
        asStr(o.direction),
        asNum(o.amount) ?? 0,
        asStr(o.asOfDate) ?? now.slice(0, 10),
        asStr(o.notes),
        asStr(o.recordedById),
        asStr(o.createdAt) ?? asStr(r.updatedAt) ?? now,
        asStr(r.updatedAt) ?? now,
      ],
    }
  }

  private savingsAccountUpsert(r: SyncRecord): { sql: string; params: unknown[] } {
    const s = r as Record<string, unknown>
    const now = new Date().toISOString()
    const tagged = s.taggedProducts == null ? null : JSON.stringify(s.taggedProducts)
    return {
      sql: `INSERT INTO savings_accounts
        (id, business_id, customer_id, customer_name, customer_phone, account_number, balance,
         total_deposited, total_refunded, total_used, total_transferred, status, outcome, closed_at,
         closed_by_id, transferred_to_id, tagged_products, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          customer_name = excluded.customer_name, customer_phone = excluded.customer_phone,
          balance = excluded.balance, total_deposited = excluded.total_deposited,
          total_refunded = excluded.total_refunded, total_used = excluded.total_used,
          total_transferred = excluded.total_transferred, status = excluded.status, outcome = excluded.outcome,
          closed_at = excluded.closed_at, closed_by_id = excluded.closed_by_id,
          transferred_to_id = excluded.transferred_to_id, tagged_products = excluded.tagged_products,
          is_deleted = excluded.is_deleted, updated_at = excluded.updated_at`,
      params: [
        asStr(r.id),
        asStr(s.businessId),
        asStr(s.customerId),
        asStr(s.customerName),
        asStr(s.customerPhone),
        asStr(s.accountNumber),
        asNum(s.balance) ?? 0,
        asNum(s.totalDeposited) ?? 0,
        asNum(s.totalRefunded) ?? 0,
        asNum(s.totalUsed) ?? 0,
        asNum(s.totalTransferred) ?? 0,
        asStr(s.status) ?? 'OPEN',
        asStr(s.outcome),
        asStr(s.closedAt),
        asStr(s.closedById),
        asStr(s.transferredToId),
        tagged,
        r.isDeleted ? 1 : 0,
        asStr(s.createdAt) ?? asStr(r.updatedAt) ?? now,
        asStr(r.updatedAt) ?? now,
      ],
    }
  }

  private savingsTransactionUpsert(r: SyncRecord): { sql: string; params: unknown[] } {
    const s = r as Record<string, unknown>
    const now = new Date().toISOString()
    return {
      sql: `INSERT INTO savings_transactions
        (id, savings_id, business_id, type, direction, amount, method, mobile_money_reference, sale_id,
         notes, recorded_by_id, occurred_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING`,
      params: [
        asStr(r.id),
        asStr(s.savingsId),
        asStr(s.businessId),
        asStr(s.type),
        asStr(s.direction),
        asNum(s.amount) ?? 0,
        asStr(s.method),
        asStr(s.mobileMoneyReference),
        asStr(s.saleId),
        asStr(s.notes),
        asStr(s.recordedById),
        asStr(s.occurredAt) ?? now,
        asStr(s.createdAt) ?? now,
      ],
    }
  }

  private expenseCategoryUpsert(r: SyncRecord): { sql: string; params: unknown[] } {
    const e = r as Record<string, unknown>
    const now = new Date().toISOString()
    return {
      sql: `INSERT INTO expense_categories
        (id, business_id, name, slug, color, icon, sort_order, is_active, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name, slug = excluded.slug, color = excluded.color, icon = excluded.icon,
          sort_order = excluded.sort_order, is_active = excluded.is_active, is_deleted = excluded.is_deleted,
          updated_at = excluded.updated_at`,
      params: [
        asStr(r.id),
        asStr(e.businessId),
        asStr(e.name),
        asStr(e.slug),
        asStr(e.color),
        asStr(e.icon),
        asNum(e.sortOrder) ?? 0,
        r.isDeleted ? 0 : 1,
        r.isDeleted ? 1 : 0,
        asStr(e.createdAt) ?? asStr(r.updatedAt) ?? now,
        asStr(r.updatedAt) ?? now,
      ],
    }
  }

  private expenseUpsert(r: SyncRecord): { sql: string; params: unknown[] } {
    const e = r as Record<string, unknown>
    const now = new Date().toISOString()
    const categoryId = asStr(e.categoryId)
    return {
      sql: `INSERT INTO expenses
        (id, business_id, recorded_by_id, category, category_id, description, amount, currency, payment_method,
         receipt_url, vendor, notes, is_recurring, status, date, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          category_id = excluded.category_id, description = excluded.description, amount = excluded.amount,
          currency = excluded.currency, payment_method = excluded.payment_method, receipt_url = excluded.receipt_url,
          vendor = excluded.vendor, notes = excluded.notes, is_recurring = excluded.is_recurring,
          status = excluded.status, date = excluded.date, is_deleted = excluded.is_deleted, updated_at = excluded.updated_at`,
      params: [
        asStr(r.id),
        asStr(e.businessId),
        asStr(e.recordedById),
        categoryId, // legacy NOT NULL `category` column — store the id (display reads category_id)
        categoryId,
        asStr(e.description),
        asNum(e.amount) ?? 0,
        asStr(e.currency) ?? 'XAF',
        asStr(e.paymentMethod),
        asStr(e.receiptUrl),
        asStr(e.vendor),
        asStr(e.notes),
        e.isRecurring ? 1 : 0,
        asStr(e.status) ?? 'PAID',
        asStr(e.expenseDate) ?? now.slice(0, 10),
        r.isDeleted ? 1 : 0,
        asStr(e.createdAt) ?? asStr(r.updatedAt) ?? now,
        asStr(r.updatedAt) ?? now,
      ],
    }
  }

  private categoryUpsert(r: SyncRecord): { sql: string; params: unknown[] } {
    const c = r as Record<string, unknown>
    const now = new Date().toISOString()
    return {
      sql: `INSERT INTO product_categories
        (id, business_id, name, slug, description, color, icon, image_url, sort_order, parent_id, depth, is_active, show_online, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name, slug = excluded.slug, description = excluded.description,
          color = excluded.color, icon = excluded.icon,
          image_url = excluded.image_url, sort_order = excluded.sort_order, parent_id = excluded.parent_id,
          depth = excluded.depth, is_active = excluded.is_active, show_online = excluded.show_online,
          is_deleted = excluded.is_deleted, updated_at = excluded.updated_at`,
      params: [
        asStr(r.id),
        asStr(c.businessId),
        asStr(c.name),
        asStr(c.slug),
        asStr(c.description),
        asStr(c.color),
        asStr(c.icon),
        asStr(c.imageUrl),
        asNum(c.sortOrder) ?? 0,
        asStr(c.parentId),
        asNum(c.depth) ?? 1,
        r.isDeleted ? 0 : c.isActive === false ? 0 : 1,
        c.showOnline === false ? 0 : 1,
        r.isDeleted ? 1 : 0,
        asStr(c.createdAt) ?? asStr(r.updatedAt) ?? now,
        asStr(r.updatedAt) ?? now,
      ],
    }
  }

  private attributeGroupUpsert(r: SyncRecord): { sql: string; params: unknown[] } {
    const c = r as Record<string, unknown>
    const now = new Date().toISOString()
    return {
      sql: `INSERT INTO attribute_groups
        (id, business_id, name, display_type, sort_order, is_active, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name, display_type = excluded.display_type, sort_order = excluded.sort_order,
          is_active = excluded.is_active, is_deleted = excluded.is_deleted, updated_at = excluded.updated_at`,
      params: [
        asStr(r.id),
        asStr(c.businessId),
        asStr(c.name),
        asStr(c.displayType) ?? 'CHIPS',
        asNum(c.sortOrder) ?? 0,
        r.isDeleted ? 0 : c.isActive === false ? 0 : 1,
        r.isDeleted ? 1 : 0,
        asStr(c.createdAt) ?? asStr(r.updatedAt) ?? now,
        asStr(r.updatedAt) ?? now,
      ],
    }
  }

  private attributeOptionUpsert(r: SyncRecord): { sql: string; params: unknown[] } {
    const c = r as Record<string, unknown>
    const now = new Date().toISOString()
    return {
      sql: `INSERT INTO attribute_options
        (id, group_id, business_id, value, color_hex, sort_order, is_active, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          group_id = excluded.group_id, value = excluded.value, color_hex = excluded.color_hex,
          sort_order = excluded.sort_order, is_active = excluded.is_active, is_deleted = excluded.is_deleted,
          updated_at = excluded.updated_at`,
      params: [
        asStr(r.id),
        asStr(c.groupId),
        asStr(c.businessId),
        asStr(c.value),
        asStr(c.colorHex),
        asNum(c.sortOrder) ?? 0,
        r.isDeleted ? 0 : c.isActive === false ? 0 : 1,
        r.isDeleted ? 1 : 0,
        asStr(c.createdAt) ?? asStr(r.updatedAt) ?? now,
        asStr(r.updatedAt) ?? now,
      ],
    }
  }

  private categoryAttributeGroupUpsert(r: SyncRecord): { sql: string; params: unknown[] } {
    const c = r as Record<string, unknown>
    const now = new Date().toISOString()
    return {
      sql: `INSERT INTO category_attribute_groups
        (id, business_id, category_id, attribute_group_id, is_required, sort_order, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          category_id = excluded.category_id, attribute_group_id = excluded.attribute_group_id,
          is_required = excluded.is_required, sort_order = excluded.sort_order,
          is_deleted = excluded.is_deleted, updated_at = excluded.updated_at`,
      params: [
        asStr(r.id),
        asStr(c.businessId),
        asStr(c.categoryId),
        asStr(c.attributeGroupId),
        c.isRequired === false ? 0 : 1,
        asNum(c.sortOrder) ?? 0,
        r.isDeleted ? 1 : 0,
        asStr(c.createdAt) ?? asStr(r.updatedAt) ?? now,
        asStr(r.updatedAt) ?? now,
      ],
    }
  }

  private unitOfMeasureUpsert(r: SyncRecord): { sql: string; params: unknown[] } {
    const c = r as Record<string, unknown>
    const now = new Date().toISOString()
    return {
      sql: `INSERT INTO unit_of_measures
        (id, name, abbreviation, business_id, type, is_active, is_deleted, is_default, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name, abbreviation = excluded.abbreviation, business_id = excluded.business_id,
          type = excluded.type, is_active = excluded.is_active, is_deleted = excluded.is_deleted,
          is_default = excluded.is_default, updated_at = excluded.updated_at`,
      params: [
        asStr(r.id),
        asStr(c.name),
        asStr(c.abbreviation),
        asStr(c.businessId),
        asStr(c.type),
        r.isDeleted ? 0 : c.isActive === false ? 0 : 1,
        r.isDeleted ? 1 : 0,
        c.isDefault === true ? 1 : 0,
        asStr(c.createdAt) ?? asStr(r.updatedAt) ?? now,
        asStr(r.updatedAt) ?? now,
      ],
    }
  }

  private brandUpsert(r: SyncRecord): { sql: string; params: unknown[] } {
    const c = r as Record<string, unknown>
    const now = new Date().toISOString()
    return {
      sql: `INSERT INTO brands
        (id, business_id, name, slug, logo_url, description, is_active, sort_order, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name, slug = excluded.slug, logo_url = excluded.logo_url,
          description = excluded.description, is_active = excluded.is_active, sort_order = excluded.sort_order,
          is_deleted = excluded.is_deleted, updated_at = excluded.updated_at`,
      params: [
        asStr(r.id),
        asStr(c.businessId),
        asStr(c.name),
        asStr(c.slug),
        asStr(c.logoUrl),
        asStr(c.description),
        r.isDeleted ? 0 : c.isActive === false ? 0 : 1,
        asNum(c.sortOrder) ?? 0,
        r.isDeleted ? 1 : 0,
        asStr(c.createdAt) ?? asStr(r.updatedAt) ?? now,
        asStr(r.updatedAt) ?? now,
      ],
    }
  }

  private modelUpsert(r: SyncRecord): { sql: string; params: unknown[] } {
    const c = r as Record<string, unknown>
    const now = new Date().toISOString()
    return {
      sql: `INSERT INTO models
        (id, business_id, brand_id, name, slug, is_active, sort_order, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          brand_id = excluded.brand_id, name = excluded.name, slug = excluded.slug,
          is_active = excluded.is_active, sort_order = excluded.sort_order,
          is_deleted = excluded.is_deleted, updated_at = excluded.updated_at`,
      params: [
        asStr(r.id),
        asStr(c.businessId),
        asStr(c.brandId),
        asStr(c.name),
        asStr(c.slug),
        r.isDeleted ? 0 : c.isActive === false ? 0 : 1,
        asNum(c.sortOrder) ?? 0,
        r.isDeleted ? 1 : 0,
        asStr(c.createdAt) ?? asStr(r.updatedAt) ?? now,
        asStr(r.updatedAt) ?? now,
      ],
    }
  }

  private brandCategoryUpsert(r: SyncRecord): { sql: string; params: unknown[] } {
    const c = r as Record<string, unknown>
    const now = new Date().toISOString()
    return {
      sql: `INSERT INTO brand_categories
        (id, business_id, brand_id, category_id, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          brand_id = excluded.brand_id, category_id = excluded.category_id,
          is_deleted = excluded.is_deleted, updated_at = excluded.updated_at`,
      params: [
        asStr(r.id),
        asStr(c.businessId),
        asStr(c.brandId),
        asStr(c.categoryId),
        r.isDeleted ? 1 : 0,
        asStr(c.createdAt) ?? asStr(r.updatedAt) ?? now,
        asStr(r.updatedAt) ?? now,
      ],
    }
  }

  private productUpsert(r: SyncRecord): { sql: string; params: unknown[] } {
    const c = r as Record<string, unknown>
    const now = new Date().toISOString()
    return {
      sql: `INSERT INTO products
        (id, business_id, name, slug, description, sku, barcode, barcode_type, is_barcode_generated,
         price, cost_price, currency, tax_rate, product_type, is_service, track_inventory,
         category_id, brand_id, model_id, unit_of_measure_id, image_url, created_by_id,
         is_featured, is_published_online, online_description, online_stock_reserve,
         meta_title, meta_description, is_serialized, serial_type, warranty_months,
         is_active, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name, slug = excluded.slug, description = excluded.description,
          sku = excluded.sku, barcode = excluded.barcode, barcode_type = excluded.barcode_type,
          is_barcode_generated = excluded.is_barcode_generated, price = excluded.price,
          cost_price = excluded.cost_price, currency = excluded.currency, tax_rate = excluded.tax_rate,
          product_type = excluded.product_type, is_service = excluded.is_service,
          track_inventory = excluded.track_inventory, category_id = excluded.category_id,
          brand_id = excluded.brand_id, model_id = excluded.model_id,
          unit_of_measure_id = excluded.unit_of_measure_id, image_url = excluded.image_url,
          created_by_id = excluded.created_by_id, is_featured = excluded.is_featured,
          is_published_online = excluded.is_published_online, online_description = excluded.online_description,
          online_stock_reserve = excluded.online_stock_reserve, meta_title = excluded.meta_title,
          meta_description = excluded.meta_description, is_serialized = excluded.is_serialized,
          serial_type = excluded.serial_type, warranty_months = excluded.warranty_months,
          is_active = excluded.is_active, is_deleted = excluded.is_deleted, updated_at = excluded.updated_at`,
      params: [
        asStr(r.id),
        asStr(c.businessId),
        asStr(c.name),
        asStr(c.slug),
        asStr(c.description),
        asStr(c.sku),
        asStr(c.barcode),
        asStr(c.barcodeType),
        c.isBarcodeGenerated === true ? 1 : 0,
        asNum(c.sellingPrice) ?? 0,
        asNum(c.costPrice),
        asStr(c.currency) ?? 'XAF',
        asNum(c.taxRate) ?? 0,
        asStr(c.productType) ?? 'SIMPLE',
        c.isService === true ? 1 : 0,
        r.isDeleted ? 0 : c.trackInventory === false ? 0 : 1,
        asStr(c.categoryId),
        asStr(c.brandId),
        asStr(c.modelId),
        asStr(c.unitOfMeasureId),
        asStr(c.imageUrl),
        asStr(c.createdById),
        c.isFeatured === true ? 1 : 0,
        c.isPublishedOnline === true ? 1 : 0,
        asStr(c.onlineDescription),
        asNum(c.onlineStockReserve) ?? 0,
        asStr(c.metaTitle),
        asStr(c.metaDescription),
        c.isSerialized === true ? 1 : 0,
        asStr(c.serialType),
        asNum(c.warrantyMonths),
        r.isDeleted ? 0 : c.isActive === false ? 0 : 1,
        r.isDeleted ? 1 : 0,
        asStr(c.createdAt) ?? asStr(r.updatedAt) ?? now,
        asStr(r.updatedAt) ?? now,
      ],
    }
  }

  private productImageUpsert(r: SyncRecord): { sql: string; params: unknown[] } {
    const c = r as Record<string, unknown>
    const now = new Date().toISOString()
    return {
      sql: `INSERT INTO product_images
        (id, business_id, product_id, url, alt_text, sort_order, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          product_id = excluded.product_id, url = excluded.url, alt_text = excluded.alt_text,
          sort_order = excluded.sort_order, is_deleted = excluded.is_deleted, updated_at = excluded.updated_at`,
      params: [
        asStr(r.id),
        asStr(c.businessId),
        asStr(c.productId),
        asStr(c.url),
        asStr(c.altText),
        asNum(c.sortOrder) ?? 0,
        r.isDeleted ? 1 : 0,
        asStr(c.createdAt) ?? asStr(r.updatedAt) ?? now,
        asStr(r.updatedAt) ?? now,
      ],
    }
  }

  private productVariantUpsert(r: SyncRecord): { sql: string; params: unknown[] } {
    const c = r as Record<string, unknown>
    const now = new Date().toISOString()
    return {
      sql: `INSERT INTO product_variants
        (id, business_id, product_id, name, display_name_override, price_override, cost_price_override,
         sku, barcode, is_active, sort_order, stock_quantity, low_stock_threshold, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          product_id = excluded.product_id, name = excluded.name,
          display_name_override = excluded.display_name_override, price_override = excluded.price_override,
          cost_price_override = excluded.cost_price_override, sku = excluded.sku, barcode = excluded.barcode,
          is_active = excluded.is_active, sort_order = excluded.sort_order,
          stock_quantity = excluded.stock_quantity, low_stock_threshold = excluded.low_stock_threshold,
          is_deleted = excluded.is_deleted, updated_at = excluded.updated_at`,
      params: [
        asStr(r.id),
        asStr(c.businessId),
        asStr(c.productId),
        asStr(c.name),
        asStr(c.displayNameOverride),
        asNum(c.priceOverride),
        asNum(c.costPriceOverride),
        asStr(c.sku),
        asStr(c.barcode),
        r.isDeleted ? 0 : c.isActive === false ? 0 : 1,
        asNum(c.sortOrder) ?? 0,
        asNum(c.stockQuantity) ?? 0,
        asNum(c.lowStockThreshold),
        r.isDeleted ? 1 : 0,
        asStr(c.createdAt) ?? asStr(r.updatedAt) ?? now,
        asStr(r.updatedAt) ?? now,
      ],
    }
  }

  private productVariantOptionUpsert(r: SyncRecord): { sql: string; params: unknown[] } {
    const c = r as Record<string, unknown>
    const now = new Date().toISOString()
    return {
      sql: `INSERT INTO product_variant_options
        (id, business_id, variant_id, attribute_group_id, attribute_option_id, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          variant_id = excluded.variant_id, attribute_group_id = excluded.attribute_group_id,
          attribute_option_id = excluded.attribute_option_id, is_deleted = excluded.is_deleted,
          updated_at = excluded.updated_at`,
      params: [
        asStr(r.id),
        asStr(c.businessId),
        asStr(c.variantId),
        asStr(c.attributeGroupId),
        asStr(c.attributeOptionId),
        r.isDeleted ? 1 : 0,
        asStr(c.createdAt) ?? asStr(r.updatedAt) ?? now,
        asStr(r.updatedAt) ?? now,
      ],
    }
  }

  private productSerialUnitUpsert(r: SyncRecord): { sql: string; params: unknown[] } {
    const c = r as Record<string, unknown>
    const now = new Date().toISOString()
    return {
      sql: `INSERT INTO product_serial_units
        (id, business_id, product_id, variant_id, serial_number, serial_type, status, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          product_id = excluded.product_id, variant_id = excluded.variant_id,
          serial_number = excluded.serial_number, serial_type = excluded.serial_type,
          status = excluded.status, is_deleted = excluded.is_deleted,
          updated_at = excluded.updated_at`,
      params: [
        asStr(r.id),
        asStr(c.businessId),
        asStr(c.productId),
        asStr(c.variantId),
        asStr(c.serialNumber),
        asStr(c.serialType),
        asStr(c.status) ?? 'IN_STOCK',
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
