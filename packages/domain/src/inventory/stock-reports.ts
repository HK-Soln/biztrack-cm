// ---------------------------------------------------------------------------
// Stock reports (slice 9): inventory turnover, dead stock and the supplier price trend. The
// server (online) and the till (offline) load the same rows from their own database and
// build the report here, so both versions of a report agree. The clock is passed in.
// ---------------------------------------------------------------------------

import type { DeadStockRow, InventoryTurnoverRow, SupplierPriceRow } from '@biztrack/types'

const MS_PER_DAY = 86_400_000

/** A product not sold for this many days (or never) is dead stock. */
export const DEAD_STOCK_AFTER_DAYS = 60
/** The supplier price trend compares the current cost with the cost in effect this long ago. */
export const SUPPLIER_PRICE_LOOKBACK_DAYS = [90, 180] as const

/** Report amounts carry two decimals; a non-number counts as 0. */
export function roundReportAmount(n: number): number {
  return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : 0
}

/** Annualise a period's figure by 365 / the period's days (both ends included); 1 when open. */
export function annualiseFactor(dateFrom?: string | null, dateTo?: string | null): number {
  if (!dateFrom || !dateTo) return 1
  const days = Math.max(
    1,
    Math.round((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / MS_PER_DAY) + 1,
  )
  return 365 / days
}

/** Whole days from `at` to `nowMs`, never negative; null when there is no date. */
export function daysSince(at: string | Date | null | undefined, nowMs: number): number | null {
  if (!at) return null
  const t = at instanceof Date ? at.getTime() : new Date(at).getTime()
  if (!Number.isFinite(t)) return null
  return Math.max(0, Math.floor((nowMs - t) / MS_PER_DAY))
}

/**
 * Inventory turnover: each in-stock product's stock value at cost and its cost of goods sold
 * over the period, annualised. Largest stock value first.
 */
export function inventoryTurnover(input: {
  stock: ReadonlyArray<{ productId: string; name: string; stockCost: number }>
  cogsByProduct: ReadonlyMap<string, number>
  dateFrom?: string | null
  dateTo?: string | null
}): InventoryTurnoverRow[] {
  const factor = annualiseFactor(input.dateFrom, input.dateTo)
  return input.stock
    .map((r) => ({
      productId: r.productId,
      name: r.name,
      avgStockCost: roundReportAmount(r.stockCost),
      annualCogs: roundReportAmount((input.cogsByProduct.get(r.productId) ?? 0) * factor),
    }))
    .sort((a, b) => b.avgStockCost - a.avgStockCost)
}

/**
 * Dead stock: in-stock products not sold for DEAD_STOCK_AFTER_DAYS days or never, with the
 * total stock value at cost of every in-stock product (the share's denominator).
 */
export function deadStock(input: {
  stock: ReadonlyArray<{
    productId: string
    name: string
    sku: string | null
    quantity: number
    costValue: number
  }>
  lastSoldAt: ReadonlyMap<string, string | Date | null>
  nowMs: number
}): { rows: DeadStockRow[]; stockCostTotal: number } {
  const stockCostTotal = roundReportAmount(input.stock.reduce((s, r) => s + r.costValue, 0))
  const rows = input.stock
    .map((r) => ({
      productId: r.productId,
      name: r.name,
      sku: r.sku ?? null,
      quantity: r.quantity,
      costValue: roundReportAmount(r.costValue),
      daysSinceLastSale: daysSince(input.lastSoldAt.get(r.productId) ?? null, input.nowMs),
    }))
    .filter((r) => r.daysSinceLastSale === null || r.daysSinceLastSale >= DEAD_STOCK_AFTER_DAYS)
  return { rows, stockCostTotal }
}

/**
 * Supplier price trend: per product, the restock unit cost now and the cost in effect 90 and
 * 180 days ago, with the latest supplier. `restocks` are the restock lines, oldest first.
 */
export function supplierPriceTrend(
  restocks: ReadonlyArray<{
    productId: string
    name: string
    supplier: string | null
    unitCost: string | number | null
    createdAt: string | Date
  }>,
  nowMs: number,
): SupplierPriceRow[] {
  const [days3, days6] = SUPPLIER_PRICE_LOOKBACK_DAYS
  const cut3 = nowMs - days3 * MS_PER_DAY
  const cut6 = nowMs - days6 * MS_PER_DAY
  const byProduct = new Map<
    string,
    { name: string; supplier: string | null; entries: Array<{ cost: number; t: number }> }
  >()
  for (const r of restocks) {
    if (r.unitCost === null) continue
    const t = r.createdAt instanceof Date ? r.createdAt.getTime() : new Date(r.createdAt).getTime()
    const cost = Number(r.unitCost)
    if (!Number.isFinite(t) || !Number.isFinite(cost)) continue
    const g = byProduct.get(r.productId) ?? { name: r.name, supplier: r.supplier, entries: [] }
    g.name = r.name
    g.supplier = r.supplier // oldest first, so the last one written is the latest supplier
    g.entries.push({ cost, t })
    byProduct.set(r.productId, g)
  }
  // The latest entry at or before `before`.
  const pick = (entries: Array<{ cost: number; t: number }>, before: number): number | null => {
    let best: { cost: number; t: number } | null = null
    for (const e of entries) if (e.t <= before && (!best || e.t > best.t)) best = e
    return best ? roundReportAmount(best.cost) : null
  }
  const out: SupplierPriceRow[] = []
  for (const [productId, g] of byProduct) {
    const sorted = g.entries.slice().sort((a, b) => a.t - b.t)
    const current = sorted.length ? roundReportAmount(sorted[sorted.length - 1]!.cost) : null
    out.push({
      productId,
      name: g.name,
      supplier: g.supplier,
      cost6mo: pick(sorted, cut6),
      cost3mo: pick(sorted, cut3),
      current,
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * The catalog's value: its stock at cost and at selling price (two decimals) and the blended
 * margin between them, in percent of the selling value (0 when nothing is in stock).
 */
export function catalogValue(input: { costValue: number; retailValue: number }): {
  catalogValueCost: number
  retailValue: number
  blendedMarginPct: number
} {
  const catalogValueCost = roundReportAmount(input.costValue)
  const retailValue = roundReportAmount(input.retailValue)
  const blendedMarginPct =
    retailValue > 0 ? roundReportAmount(((retailValue - catalogValueCost) / retailValue) * 100) : 0
  return { catalogValueCost, retailValue, blendedMarginPct }
}
