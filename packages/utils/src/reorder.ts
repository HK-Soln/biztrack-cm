// ---------------------------------------------------------------------------
// Velocity-based reorder (BIZ-4.6) — the ONE definition of sales velocity and
// days-of-cover, shared by apps/api and apps/desktop-v2 so both runtimes agree
// by construction (same story as computeExpectedCash).
//
//   velocity   = units sold in the window ÷ the days the product was actually
//                sellable (window days − days the shelf was empty)
//   daysCover  = current stock ÷ velocity   → "Reste N jours"
//
// Why exclude stock-out days: a product that sold 20 units but was out of stock
// for half the window is really selling ~40/window when it CAN be sold. Dividing
// by calendar days understates velocity and overstates cover, so the reorder
// fires too late. We reconstruct the empty stretches from the movement ledger's
// `quantity_after` (stored on every movement) and divide by sellable days only.
//
// Confidence guards: a velocity from too little history or too few units is a
// guess, and a wrong "reorder now" is worse than none. Below the thresholds we
// return null and the caller falls back to the manual reorder point — silence
// beats a wrong alert.
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000

/** Trailing window over which velocity is measured. */
export const REORDER_WINDOW_DAYS = 28
/** A product younger than this has too little history to trust a velocity. */
export const REORDER_MIN_HISTORY_DAYS = 14
/** Fewer than this many units sold in the window is too thin a signal. */
export const REORDER_MIN_UNITS = 10

/** One step in a product's stock timeline: the level immediately after a movement. */
export interface StockPoint {
  /** Epoch ms of the movement. */
  at: number
  /** `quantity_after` — the stock level immediately after this movement. */
  after: number
}

/**
 * Total zero-stock duration (ms) inside `[windowStartMs, nowMs]`, reconstructed
 * from the stepwise stock timeline.
 *
 * `startStock` is the level at `windowStartMs` — the `quantity_after` of the last
 * movement BEFORE the window (0 when the product had no prior movement). `points`
 * are the movements INSIDE the window, ascending by `at`. Between two consecutive
 * points the level is constant (the earlier point's `after`); a stretch counts as
 * stock-out while the prevailing level is `<= 0`.
 */
export function computeStockoutMs(
  windowStartMs: number,
  nowMs: number,
  startStock: number,
  points: StockPoint[],
): number {
  if (nowMs <= windowStartMs) return 0
  let out = 0
  let prevAt = windowStartMs
  let prevStock = startStock
  for (const p of points) {
    const at = Math.min(Math.max(p.at, windowStartMs), nowMs)
    if (at > prevAt && prevStock <= 0) out += at - prevAt
    prevAt = at
    prevStock = p.after
  }
  if (nowMs > prevAt && prevStock <= 0) out += nowMs - prevAt
  return out
}

export interface VelocityInput {
  /** Units sold in the trailing window (Σ sale_items.quantity on COMPLETED sales). */
  unitsSold: number
  /** Window length in days (defaults to REORDER_WINDOW_DAYS). */
  windowDays?: number
  /** Zero-stock duration inside the window, from computeStockoutMs. */
  stockoutMs: number
  /** Current on-hand stock. */
  currentStock: number
  /** Days since the product was created (its available history). */
  productAgeDays: number
}

export interface VelocityResult {
  /** Units sold per sellable day. null when the guards fail (not trustworthy). */
  velocity: number | null
  /** Days of stock left at the current rate ("Reste N jours"). null when untrusted. */
  daysCover: number | null
  /** Whole days the product was out of stock in the window (for display/debug). */
  stockoutDays: number
  /** Whether the confidence guards passed. */
  trusted: boolean
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/**
 * Velocity + days-of-cover with confidence guards. Returns velocity/daysCover of
 * null (trusted:false) when there is too little history or too few units to trust,
 * so the caller can fall back to the manual reorder point or stay silent.
 */
export function computeReorderVelocity(input: VelocityInput): VelocityResult {
  const windowDays = Math.max(1, input.windowDays ?? REORDER_WINDOW_DAYS)
  const stockoutDaysExact = Math.min(Math.max(0, input.stockoutMs) / MS_PER_DAY, windowDays)
  const stockoutDays = Math.round(stockoutDaysExact)
  // Sellable days: the window minus the empty stretches. Never below 1 — a product
  // that sold anything was in stock at least momentarily, and it guards the divide.
  const sellableDays = Math.max(1, windowDays - stockoutDaysExact)

  const trusted =
    input.productAgeDays >= REORDER_MIN_HISTORY_DAYS && input.unitsSold >= REORDER_MIN_UNITS

  if (!trusted) {
    return { velocity: null, daysCover: null, stockoutDays, trusted: false }
  }

  const velocity = input.unitsSold / sellableDays
  if (!(velocity > 0)) {
    return { velocity: null, daysCover: null, stockoutDays, trusted: false }
  }
  const daysCover = Math.max(0, input.currentStock) / velocity
  return {
    velocity: round1(velocity),
    daysCover: Math.round(daysCover),
    stockoutDays,
    trusted: true,
  }
}

// ---------------------------------------------------------------------------
// Reorder digest (BIZ-4.5 / "À commander") — group the low-stock lines by supplier
// and rank by revenue-at-risk, shared by apps/api and apps/desktop-v2 so the digest
// and the offline surface agree.
//
//   revenue-at-risk = lost sales PER DAY while the shelf is empty = sellingPrice × velocity.
//   When velocity isn't trustworthy (BIZ-4.6 guards) we fall back to the order value
//   (sellingPrice × suggestedQty) so the line still ranks rather than dropping to zero.
// ---------------------------------------------------------------------------

/** One low-stock line, pre-digest (no revenueAtRisk yet). */
export interface ReorderDigestLineInput {
  productId: string
  name: string
  sku: string | null
  currentStock: number
  suggestedQty: number
  unitCost: number | null
  sellingPrice: number | null
  currency: string
  velocity?: number | null
  daysCover?: number | null
  stockoutDays?: number | null
  /** Last supplier who restocked this product (grouping key); null = no supplier yet. */
  supplierId: string | null
  supplierName: string | null
  supplierPhone?: string | null
}

export interface ReorderDigestLine extends ReorderDigestLineInput {
  /** Lost-sales/day (or the order-value fallback). Ranks the line. */
  revenueAtRisk: number
}

export interface ReorderSupplierGroup {
  supplierId: string | null
  supplierName: string | null
  supplierPhone: string | null
  lineCount: number
  /** Σ revenueAtRisk over the group's lines. */
  totalRevenueAtRisk: number
  /** Σ suggestedQty × unitCost — what an order to this supplier would cost. */
  estOrderCost: number
  lines: ReorderDigestLine[]
}

export interface ReorderDigest {
  currency: string
  generatedAt: string
  productCount: number
  totalRevenueAtRisk: number
  /** Supplier groups, worst revenue-at-risk first; the "no supplier yet" group sorts last. */
  supplierGroups: ReorderSupplierGroup[]
}

/** Money at risk each day a product is out of stock. See the module header. */
export function computeRevenueAtRisk(input: {
  sellingPrice: number | null
  velocity?: number | null
  suggestedQty: number
}): number {
  const price = input.sellingPrice ?? 0
  if (price <= 0) return 0
  if (input.velocity && input.velocity > 0) return Math.round(price * input.velocity)
  return Math.round(price * Math.max(0, input.suggestedQty))
}

const NO_SUPPLIER_KEY = '__none__'

/** Group low-stock lines by supplier and rank by revenue-at-risk. */
export function buildReorderDigest(
  lines: ReorderDigestLineInput[],
  opts: { currency: string; generatedAt: string },
): ReorderDigest {
  const groups = new Map<string, ReorderSupplierGroup>()
  let totalRevenueAtRisk = 0

  for (const line of lines) {
    const revenueAtRisk = computeRevenueAtRisk(line)
    totalRevenueAtRisk += revenueAtRisk
    const key = line.supplierId ?? NO_SUPPLIER_KEY
    let group = groups.get(key)
    if (!group) {
      group = {
        supplierId: line.supplierId,
        supplierName: line.supplierName,
        supplierPhone: line.supplierPhone ?? null,
        lineCount: 0,
        totalRevenueAtRisk: 0,
        estOrderCost: 0,
        lines: [],
      }
      groups.set(key, group)
    }
    group.lines.push({ ...line, revenueAtRisk })
    group.lineCount += 1
    group.totalRevenueAtRisk += revenueAtRisk
    group.estOrderCost += Math.max(0, line.suggestedQty) * (line.unitCost ?? 0)
  }

  const supplierGroups = [...groups.values()]
  for (const g of supplierGroups) {
    g.lines.sort((a, b) => b.revenueAtRisk - a.revenueAtRisk)
  }
  supplierGroups.sort((a, b) => {
    // Keep the "no supplier yet" group last regardless of its risk.
    const aNone = a.supplierId === null
    const bNone = b.supplierId === null
    if (aNone !== bNone) return aNone ? 1 : -1
    return b.totalRevenueAtRisk - a.totalRevenueAtRisk
  })

  return {
    currency: opts.currency,
    generatedAt: opts.generatedAt,
    productCount: lines.length,
    totalRevenueAtRisk,
    supplierGroups,
  }
}
