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
  'completed',
  'partial',
  'failed',
  'enqueue_failed',
  'skipped',
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

/**
 * Schema-driven pull appliers: local column -> server SyncRecord field. The generic
 * applier (`applyGeneric`) introspects the *live* table and writes only columns that
 * actually exist, so these maps are resilient to schema drift (e.g. inventory_levels
 * gaining variant_id, debts lacking is_deleted/updated_at). `isDeleted` is mapped onto
 * an `is_deleted` column automatically when the table has one.
 */
const SALE_MAP: Record<string, string> = {
  id: 'id',
  business_id: 'businessId',
  client_id: 'clientId',
  cashier_id: 'cashierId',
  cashier_name: 'cashierName',
  sale_number: 'saleNumber',
  receipt_number: 'saleNumber',
  status: 'status',
  subtotal: 'subtotal',
  total_amount: 'totalAmount',
  net_amount: 'totalAmount',
  discount_amount: 'discountAmount',
  charges_amount: 'chargesAmount',
  tax_amount: 'taxAmount',
  amount_paid: 'amountPaid',
  credit_amount: 'creditAmount',
  change_given: 'changeGiven',
  customer_id: 'customerId',
  customer_name: 'customerName',
  customer_phone: 'customerPhone',
  notes: 'notes',
  price_drift_warning: 'priceDriftWarning',
  currency: 'currency',
  sale_date: 'saleDate',
  sold_at: 'soldAt',
  synced_at: 'syncedAt',
  voided_at: 'voidedAt',
  voided_by: 'voidedById',
  void_reason: 'voidReason',
  source: 'source',
  online_order_id: 'onlineOrderId',
  created_at: 'createdAt',
  updated_at: 'updatedAt',
}
const SALE_ITEM_MAP: Record<string, string> = {
  id: 'id',
  sale_id: 'saleId',
  business_id: 'businessId',
  product_id: 'productId',
  product_name: 'productName',
  product_sku: 'productSku',
  unit_of_measure: 'unitOfMeasure',
  quantity: 'quantity',
  unit_price: 'unitPrice',
  discount_amount: 'discountAmount',
  line_total: 'lineTotal',
  total_price: 'lineTotal',
  cost_price: 'costPrice',
  created_at: 'createdAt',
  updated_at: 'updatedAt',
}
const SALE_PAYMENT_MAP: Record<string, string> = {
  id: 'id',
  sale_id: 'saleId',
  business_id: 'businessId',
  method: 'method',
  amount: 'amount',
  mobile_money_reference: 'mobileMoneyReference',
  kind: 'kind',
  recorded_at: 'recordedAt',
  recorded_by_id: 'recordedById',
  note: 'note',
  created_at: 'createdAt',
}
const SALE_CHARGE_MAP: Record<string, string> = {
  id: 'id',
  sale_id: 'saleId',
  business_id: 'businessId',
  charge_type_id: 'chargeTypeId',
  name: 'name',
  rate_type: 'rateType',
  rate_value: 'rateValue',
  amount: 'amount',
  created_at: 'createdAt',
}
const SALE_RETURN_MAP: Record<string, string> = {
  id: 'id',
  sale_id: 'saleId',
  business_id: 'businessId',
  online_order_id: 'onlineOrderId',
  reason: 'reason',
  restock: 'restock',
  refund_amount: 'refundAmount',
  created_by_id: 'createdById',
  created_at: 'createdAt',
}
const SALE_RETURN_ITEM_MAP: Record<string, string> = {
  id: 'id',
  sale_return_id: 'saleReturnId',
  business_id: 'businessId',
  sale_item_id: 'saleItemId',
  quantity: 'quantity',
  serial_unit_id: 'serialUnitId',
  created_at: 'createdAt',
}
const DEBT_MAP: Record<string, string> = {
  id: 'id',
  business_id: 'businessId',
  contact_id: 'contactId',
  direction: 'direction',
  source_type: 'sourceType',
  source_id: 'sourceId',
  source_reference: 'sourceReference',
  original_amount: 'originalAmount',
  status: 'status',
  due_date: 'dueDate',
  notes: 'notes',
  created_at: 'createdAt',
  updated_at: 'updatedAt',
  settled_at: 'settledAt',
  written_off_at: 'writtenOffAt',
  written_off_by: 'writtenOffById',
  written_off_reason: 'writtenOffReason',
}
const INVENTORY_LEVEL_MAP: Record<string, string> = {
  id: 'id',
  business_id: 'businessId',
  product_id: 'productId',
  variant_id: 'variantId',
  quantity: 'quantity',
  low_stock_threshold: 'lowStockThreshold',
  reorder_point: 'reorderPoint',
  last_restock_at: 'lastRestockAt',
  created_at: 'createdAt',
  updated_at: 'updatedAt',
}
const INVENTORY_MOVEMENT_MAP: Record<string, string> = {
  id: 'id',
  business_id: 'businessId',
  product_id: 'productId',
  type: 'type',
  quantity_change: 'quantityChange',
  quantity_before: 'quantityBefore',
  quantity_after: 'quantityAfter',
  reference_type: 'referenceType',
  reference_id: 'referenceId',
  notes: 'notes',
  performed_by_id: 'performedById',
  performed_by_name: 'performedByName',
  created_at: 'createdAt',
}
const RESTOCK_RECORD_MAP: Record<string, string> = {
  id: 'id',
  business_id: 'businessId',
  reference_number: 'referenceNumber',
  supplier_id: 'supplierId',
  supplier_name: 'supplierName',
  total_amount: 'totalAmount',
  total_cost: 'totalCost',
  amount_paid: 'amountPaid',
  credit_amount: 'creditAmount',
  notes: 'notes',
  performed_by_id: 'performedById',
  created_at: 'createdAt',
}
const RESTOCK_ITEM_MAP: Record<string, string> = {
  id: 'id',
  restock_record_id: 'restockRecordId',
  product_id: 'productId',
  quantity: 'quantity',
  unit_cost: 'unitCost',
  new_quantity: 'newQuantity',
  created_at: 'createdAt',
}
const BUNDLE_COMPONENT_MAP: Record<string, string> = {
  id: 'id',
  business_id: 'businessId',
  bundle_product_id: 'bundleProductId',
  component_product_id: 'componentProductId',
  quantity: 'quantity',
  sort_order: 'sortOrder',
  created_at: 'createdAt',
  updated_at: 'updatedAt',
}
const ROLE_MAP: Record<string, string> = {
  id: 'id',
  business_id: 'businessId',
  name: 'name',
  description: 'description',
  is_system: 'isSystem',
  is_owner_role: 'isOwnerRole',
  colour: 'colour',
  created_at: 'createdAt',
  updated_at: 'updatedAt',
}
const TEAM_MEMBER_MAP: Record<string, string> = {
  id: 'id',
  business_id: 'businessId',
  user_id: 'userId',
  role: 'role',
  status: 'status',
  name: 'name',
  email: 'email',
  phone: 'phone',
  created_at: 'createdAt',
  updated_at: 'updatedAt',
}
const RFQ_MAP: Record<string, string> = {
  id: 'id',
  business_id: 'businessId',
  number: 'number',
  title: 'title',
  message_body: 'messageBody',
  status: 'status',
  currency: 'currency',
  created_by_id: 'createdById',
  created_at: 'createdAt',
  updated_at: 'updatedAt',
}
const RFQ_ITEM_MAP: Record<string, string> = {
  id: 'id',
  rfq_id: 'rfqId',
  product_id: 'productId',
  variant_id: 'variantId',
  description: 'description',
  quantity: 'quantity',
  created_at: 'createdAt',
}
const RFQ_SUPPLIER_MAP: Record<string, string> = {
  id: 'id',
  rfq_id: 'rfqId',
  supplier_id: 'supplierId',
  supplier_name: 'supplierName',
  status: 'status',
  quoted_total: 'quotedTotal',
  quote_notes: 'quoteNotes',
  responded_at: 'respondedAt',
  created_at: 'createdAt',
}
const PURCHASE_ORDER_MAP: Record<string, string> = {
  id: 'id',
  business_id: 'businessId',
  number: 'number',
  rfq_id: 'rfqId',
  supplier_id: 'supplierId',
  supplier_name: 'supplierName',
  title: 'title',
  message_body: 'messageBody',
  status: 'status',
  currency: 'currency',
  expected_date: 'expectedDate',
  total_amount: 'totalAmount',
  sent_at: 'sentAt',
  created_by_id: 'createdById',
  created_at: 'createdAt',
  updated_at: 'updatedAt',
}
const PURCHASE_ORDER_ITEM_MAP: Record<string, string> = {
  id: 'id',
  purchase_order_id: 'purchaseOrderId',
  product_id: 'productId',
  variant_id: 'variantId',
  description: 'description',
  quantity: 'quantity',
  unit_price: 'unitPrice',
  received_quantity: 'receivedQuantity',
  created_at: 'createdAt',
}

interface TableColumn {
  name: string
  type: string
  notnull: number
  hasDefault: boolean
}

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
  /**
   * Full re-pull: reset the cursor so the next pull starts from epoch and re-applies
   * every record from the server. Use after wiping local data or when local/server have
   * drifted — incremental pull only returns changes *after* the cursor, so a stale
   * cursor returns nothing even though local is empty. Pushes pending writes first.
   */
  async forceFullSync(): Promise<void> {
    if (this.running) return
    this.opts.setCursor('') // '' is falsy → pull() omits the cursor → server returns from epoch
    await this.sync()
  }

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
      // Never send an empty string (e.g. while a forced full resync has reset the cursor)
      // — the API validates baseCursor as an ISO date or null.
      baseCursor: this.opts.getCursor() || null,
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
        // conflict = server_wins (last-write-wins): the server copy is newer, so drop the
        // superseded local push. The local row converges to the server on the next pull.
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
            [
              attempts,
              result.errorMessage ?? 'Sync failed',
              backoffAt(attempts),
              now,
              result.operationId,
            ],
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

  /** Record ids with an unsynced local write (any non-terminal outbox state). A pull must
   *  never overwrite these — the local edit hasn't been accepted by the server yet, so
   *  clobbering it would lose the user's change (client wins its own edit). Record ids are
   *  UUIDs, unique across tables, so one set is unambiguous. */
  private pendingLocalIds(): Set<string> {
    const set = new Set<string>()
    const rows = this.opts.db.query<{ record_id: string }>(
      `SELECT DISTINCT record_id FROM sync_outbox WHERE status IN ('pending','deferred','failed','dead')`,
    )
    for (const r of rows) set.add(r.record_id)
    return set
  }

  private applyChanges(changes: ChangeSet): void {
    const ops: Array<{ sql: string; params: unknown[] }> = []
    // Never let an incoming server row overwrite a local record that still has a pending
    // outbox write — that edit must win (and re-push) first.
    const pending = this.pendingLocalIds()
    // Contacts are tier-0 roots (suppliers/customers) — apply before anything that
    // references them.
    for (const record of changes.contacts ?? []) {
      if (pending.has(record.id)) continue
      ops.push(this.contactUpsert(record))
    }
    // Opening balances depend on the contact — applied right after.
    for (const record of changes.openingBalances ?? []) {
      ops.push(this.openingBalanceUpsert(record))
    }
    for (const record of changes.productCategories ?? []) {
      if (pending.has(record.id)) continue
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
      if (pending.has(record.id)) continue
      ops.push(this.unitOfMeasureUpsert(record))
    }
    // Parents before children: brands → models + brand-category links.
    for (const record of changes.brands ?? []) {
      if (pending.has(record.id)) continue
      ops.push(this.brandUpsert(record))
    }
    for (const record of changes.models ?? []) {
      if (pending.has(record.id)) continue
      ops.push(this.modelUpsert(record))
    }
    for (const record of changes.brandCategories ?? []) {
      ops.push(this.brandCategoryUpsert(record))
    }
    // Products depend on category/unit/brand/model — applied after them.
    for (const record of changes.products ?? []) {
      if (pending.has(record.id)) continue
      ops.push(this.productUpsert(record))
    }
    for (const record of changes.productImages ?? []) {
      if (pending.has(record.id)) continue
      ops.push(this.productImageUpsert(record))
    }
    for (const record of changes.productVariants ?? []) {
      if (pending.has(record.id)) continue
      ops.push(this.productVariantUpsert(record))
    }
    for (const record of changes.productVariantOptions ?? []) {
      if (pending.has(record.id)) continue
      ops.push(this.productVariantOptionUpsert(record))
    }
    for (const record of changes.productSerialUnits ?? []) {
      if (pending.has(record.id)) continue
      ops.push(this.productSerialUnitUpsert(record))
    }
    // Expense categories (tier 0) before expenses (tier 2) that reference them.
    for (const record of changes.expenseCategories ?? []) {
      if (pending.has(record.id)) continue
      ops.push(this.expenseCategoryUpsert(record))
    }
    for (const record of changes.expenses ?? []) {
      if (pending.has(record.id)) continue
      ops.push(this.expenseUpsert(record))
    }
    // Deposit sessions (depend on contact) + their transactions.
    for (const record of changes.savingsAccounts ?? []) {
      if (pending.has(record.id)) continue
      ops.push(this.savingsAccountUpsert(record))
    }
    for (const record of changes.savingsTransactions ?? []) {
      if (pending.has(record.id)) continue
      ops.push(this.savingsTransactionUpsert(record))
    }
    // Transactional modules (schema-driven appliers). Pushed after their roots above:
    // inventory/sales after products, sale items/payments after sales, debts after both.
    const pushAll = (
      records: SyncRecord[] | undefined,
      table: string,
      map: Record<string, string>,
    ) => {
      for (const record of records ?? []) {
        if (pending.has(record.id)) continue
        const op = this.applyGeneric(table, record, map)
        if (op) ops.push(op)
      }
    }
    pushAll(changes.roles, 'roles', ROLE_MAP)
    pushAll(changes.teamMembers, 'business_members', TEAM_MEMBER_MAP)
    pushAll(changes.productBundleComponents, 'product_bundle_components', BUNDLE_COMPONENT_MAP)
    pushAll(changes.inventoryLevels, 'inventory_levels', INVENTORY_LEVEL_MAP)
    pushAll(changes.inventoryMovements, 'inventory_movements', INVENTORY_MOVEMENT_MAP)
    pushAll(changes.restockRecords, 'restock_records', RESTOCK_RECORD_MAP)
    pushAll(changes.restockItems, 'restock_items', RESTOCK_ITEM_MAP)
    pushAll(changes.sales, 'sales', SALE_MAP)
    pushAll(changes.saleItems, 'sale_items', SALE_ITEM_MAP)
    pushAll(changes.salePayments, 'sale_payments', SALE_PAYMENT_MAP)
    pushAll(changes.saleCharges, 'sale_charges', SALE_CHARGE_MAP)
    pushAll(changes.saleReturns, 'sale_returns', SALE_RETURN_MAP)
    pushAll(changes.saleReturnItems, 'sale_return_items', SALE_RETURN_ITEM_MAP)
    pushAll(changes.debts, 'debts', DEBT_MAP)
    // Procurement chain: headers before their children.
    pushAll(changes.rfqs, 'rfqs', RFQ_MAP)
    pushAll(changes.rfqItems, 'rfq_items', RFQ_ITEM_MAP)
    pushAll(changes.rfqSuppliers, 'rfq_suppliers', RFQ_SUPPLIER_MAP)
    pushAll(changes.purchaseOrders, 'purchase_orders', PURCHASE_ORDER_MAP)
    pushAll(changes.purchaseOrderItems, 'purchase_order_items', PURCHASE_ORDER_ITEM_MAP)

    if (ops.length === 0) return
    try {
      this.opts.db.batch(ops)
    } catch (err) {
      // One bad row must not abort the whole pull. Re-apply individually so the rest of
      // the catalog still lands, and log exactly which record failed.
      console.error(`[sync] apply batch failed (${(err as Error).message}); retrying row-by-row`)
      for (const op of ops) {
        try {
          this.opts.db.run(op.sql, op.params)
        } catch (e) {
          console.error(
            `[sync] skipped a record: ${(e as Error).message} :: ${op.sql.slice(0, 48)}`,
          )
        }
      }
    }
  }

  // ---- schema-driven generic applier --------------------------------------

  private columnCache = new Map<string, TableColumn[]>()
  private tableColumns(table: string): TableColumn[] {
    let cols = this.columnCache.get(table)
    if (!cols) {
      const rows = this.opts.db.query<{
        name: string
        type: string
        notnull: number
        dflt_value: unknown
      }>(`PRAGMA table_info(${table})`)
      cols = rows.map((r) => ({
        name: r.name,
        type: (r.type ?? '').toUpperCase(),
        notnull: r.notnull,
        hasDefault: r.dflt_value !== null && r.dflt_value !== undefined,
      }))
      this.columnCache.set(table, cols)
    }
    return cols
  }

  /**
   * Upsert a SyncRecord into `table` writing only columns the live table actually has
   * (drift-safe). `map` is localColumn -> recordField. NOT-NULL columns with no source
   * and no DB default are filled with a type-appropriate zero so the insert can't fail.
   */
  private applyGeneric(
    table: string,
    record: SyncRecord,
    map: Record<string, string>,
  ): { sql: string; params: unknown[] } | null {
    const cols = this.tableColumns(table)
    if (cols.length === 0) return null
    const r = record as Record<string, unknown>
    const set = new Map<string, unknown>()
    const colByName = new Map(cols.map((c) => [c.name, c]))
    for (const [col, field] of Object.entries(map)) {
      const c = colByName.get(col)
      if (!c) continue
      let v = r[field]
      if (typeof v === 'boolean') v = v ? 1 : 0
      // A NOT NULL column can't take null — the API can legitimately send null for a
      // mapped field (e.g. restock_items.new_quantity for serialised restocks), so fall
      // back to a type-appropriate zero rather than letting the insert fail.
      if (v === undefined || v === null) {
        v = c.notnull ? (/INT|REAL|NUM|DEC|FLOA|DOUB/.test(c.type) ? 0 : '') : null
      }
      set.set(col, v)
    }
    if (colByName.has('is_deleted') && !set.has('is_deleted'))
      set.set('is_deleted', r.isDeleted ? 1 : 0)
    if (!set.has('id')) return null
    // Satisfy any required column we didn't map (no source field, no DB default).
    for (const c of cols) {
      if (c.name === 'id' || set.has(c.name) || !c.notnull || c.hasDefault) continue
      set.set(c.name, /INT|REAL|NUM|DEC|FLOA|DOUB/.test(c.type) ? 0 : '')
    }
    const names = [...set.keys()]
    const updates = names.filter((n) => n !== 'id').map((n) => `${n} = excluded.${n}`)
    const sql =
      `INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})` +
      (updates.length
        ? ` ON CONFLICT(id) DO UPDATE SET ${updates.join(', ')}`
        : ` ON CONFLICT(id) DO NOTHING`)
    return { sql, params: names.map((n) => set.get(n) ?? null) }
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
         price, cost_price, currency, tax_rate, product_type, is_service, track_inventory, stock_quantity,
         low_stock_threshold, reorder_point,
         category_id, brand_id, model_id, unit_of_measure_id, image_url, created_by_id,
         is_featured, is_published_online, online_description, online_stock_reserve,
         meta_title, meta_description, is_serialized, serial_type, warranty_months,
         is_active, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name, slug = excluded.slug, description = excluded.description,
          sku = excluded.sku, barcode = excluded.barcode, barcode_type = excluded.barcode_type,
          is_barcode_generated = excluded.is_barcode_generated, price = excluded.price,
          cost_price = excluded.cost_price, currency = excluded.currency, tax_rate = excluded.tax_rate,
          product_type = excluded.product_type, is_service = excluded.is_service,
          track_inventory = excluded.track_inventory, stock_quantity = excluded.stock_quantity,
          low_stock_threshold = excluded.low_stock_threshold, reorder_point = excluded.reorder_point,
          category_id = excluded.category_id,
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
        asNum(c.stockQuantity) ?? 0,
        // Reorder threshold from the API's product-level inventory level. Column is NOT NULL,
        // so fall back to 0 (= "no reorder alert", matching the cloud when no threshold is set)
        // instead of the legacy schema default of 5, which mis-flagged everything.
        asNum(c.lowStockThreshold) ?? 0,
        asNum(c.reorderPoint),
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

  private countOutbox(): Pick<
    SyncStatus,
    'pendingCount' | 'deferredCount' | 'failedCount' | 'deadCount'
  > {
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
