import { randomUUID } from 'crypto'
import type { DataSource } from 'typeorm'
import {
  closeIntegrationDataSource,
  getIntegrationDataSource,
} from '@/testing/integration-database'
import { createSalesSyncHarness, type SalesSyncHarness } from '@/testing/sales-sync-harness'

// Slice 9: the server's inventory list, stats and reorder alerts judge stock by
// @biztrack/domain productStockStatus, one row per product, as the till does. A product
// with variants is low once one variant is out or low; a serialized product's stock is its
// in-stock units, whatever its own level holds.

describe('stock status on the server', () => {
  let dataSource: DataSource
  let h: SalesSyncHarness

  beforeAll(async () => {
    dataSource = await getIntegrationDataSource()
  })
  afterAll(async () => {
    await closeIntegrationDataSource()
  })

  let out: string
  let low: string
  let healthy: string
  let sized: string
  let phone: string

  beforeEach(async () => {
    h = await createSalesSyncHarness(dataSource)
    out = await h.seedProduct({ price: 1000, stock: 0 })
    low = await h.seedProduct({ price: 1000, stock: 3 })
    await dataSource.query(
      `UPDATE inventory_levels SET low_stock_threshold = 5 WHERE product_id = $1`,
      [low],
    )
    healthy = await h.seedProduct({ price: 1000, stock: 10 })

    // Two sizes: M has 5, S has none.
    sized = await h.seedProduct({ price: 1000, stock: 0 })
    for (const [name, quantity] of [
      ['M', 5],
      ['S', 0],
    ] as const) {
      const variantId = randomUUID()
      await dataSource.query(
        `INSERT INTO product_variants (id, business_id, product_id, name) VALUES ($1, $2, $3, $4)`,
        [variantId, h.businessId, sized, name],
      )
      await dataSource.query(
        `INSERT INTO inventory_levels (business_id, product_id, variant_id, quantity)
         VALUES ($1, $2, $3, $4)`,
        [h.businessId, sized, variantId, quantity],
      )
    }

    // Serialized: two units in stock, its own level at 0.
    phone = await h.seedProduct({ price: 1000, stock: 0 })
    await h.seedSerialUnit(phone, '490154203237518')
    await h.seedSerialUnit(phone, '356938035643809')
  })

  it('lists one row per product with its stock and status', async () => {
    const list = await h.inventory.findAll(h.businessId, { limit: 50 })
    const byId = new Map(list.data.map((row) => [row.productId, row]))

    expect(list.total).toBe(5)
    expect(byId.get(out)).toMatchObject({ quantity: 0, stockStatus: 'OUT' })
    expect(byId.get(low)).toMatchObject({ quantity: 3, stockStatus: 'LOW' })
    expect(byId.get(healthy)).toMatchObject({ quantity: 10, stockStatus: 'IN' })
    expect(byId.get(sized)).toMatchObject({ quantity: 5, stockStatus: 'LOW' })
    expect(byId.get(phone)).toMatchObject({ quantity: 2, stockStatus: 'IN' })
  })

  it('filters and counts by the same status', async () => {
    const lows = await h.inventory.findAll(h.businessId, { stockStatus: 'low' })
    expect(lows.data.map((row) => row.productId).sort()).toEqual([low, sized].sort())

    expect(await h.inventory.getStats(h.businessId)).toMatchObject({
      trackedSkus: 5,
      lowStock: 2,
      outOfStock: 1,
    })
  })

  it('suggests reordering the products that are out or low', async () => {
    const alerts = await h.inventory.getAlerts(h.businessId, {})
    const byId = new Map(alerts.data.map((row) => [row.productId, row]))

    expect([...byId.keys()].sort()).toEqual([out, low, sized].sort())
    // Up to twice the target, at least one (@biztrack/domain suggestedReorderQuantity).
    expect(byId.get(low)).toMatchObject({ currentQuantity: 3, target: 5, shortfall: 7 })
    expect(byId.get(out)).toMatchObject({ target: 0, shortfall: 1 })
    expect(await h.inventory.findBusinessIdsWithLowStockAlerts()).toContain(h.businessId)
  })

  it('takes a synced bundle sale from its components (@biztrack/domain saleStockLines)', async () => {
    const rice = await h.seedProduct({ price: 500, stock: 10 })
    const basket = await h.seedProduct({ price: 1500 })
    await dataSource.query(
      `UPDATE products SET product_type = 'COMPOSITE', track_inventory = false WHERE id = $1`,
      [basket],
    )
    await dataSource.query(
      `INSERT INTO product_bundle_components (business_id, bundle_product_id, component_product_id, quantity)
       VALUES ($1, $2, $3, 2), ($1, $2, $4, 1)`,
      [h.businessId, basket, rice, phone],
    )

    await h.sales.createFromSync(
      h.businessId,
      h.salePayload({ items: [{ productId: basket, quantity: 2, unitPrice: 1500 }] }),
    )

    // Rice: 2 per basket × 2. The serialized component holds no level to take from.
    expect(await h.stockOf(rice)).toBe(6)
    expect(await h.stockOf(phone)).toBe(0)
  })

  it("records a synced serialized sale and its void in the ledger, with the till's id", async () => {
    const units = (await dataSource.query(
      `SELECT id FROM product_serial_units WHERE product_id = $1 ORDER BY serial_number`,
      [phone],
    )) as Array<{ id: string }>
    const payload = h.salePayload({
      items: [{ productId: phone, quantity: 1, unitPrice: 1000, serialUnitId: units[0]!.id }],
    })
    const movementId = randomUUID()
    payload.items[0]!.movementId = movementId

    await h.sales.createFromSync(h.businessId, payload)
    await h.sales.createFromSync(h.businessId, payload)
    await h.sales.createFromSync(h.businessId, {
      ...payload,
      status: 'VOIDED' as never,
      voidReason: 'Rang up by mistake at the till',
    })

    const moves = (await dataSource.query(
      `SELECT id, type, quantity_change AS change, quantity_after AS after
       FROM inventory_movements WHERE product_id = $1 ORDER BY created_at, type DESC`,
      [phone],
    )) as Array<{ id: string; type: string; change: string; after: string }>
    expect(moves.map((m) => [m.type, Number(m.change), Number(m.after)])).toEqual([
      ['SALE', -1, 1],
      ['VOID_REVERSAL', 1, 2],
    ])
    expect(moves[0]!.id).toBe(movementId)
  })
})
