import { randomUUID } from 'crypto'
import type { DataSource } from 'typeorm'
import { removeProduct, removeVariant, retireSerialUnit } from '@/modules/products/catalog-removal'
import {
  closeIntegrationDataSource,
  getIntegrationDataSource,
} from '@/testing/integration-database'
import { createSalesSyncHarness, type SalesSyncHarness } from '@/testing/sales-sync-harness'

// Removing a product, a variant or a serial unit writes off what it still held in stock.
// The server's own deletes and deletes arriving by sync from a till both run these
// (ruling R18); before, a delete from a till only flagged the record and left the stock.

describe('removing catalog records', () => {
  let dataSource: DataSource
  let h: SalesSyncHarness

  beforeAll(async () => {
    dataSource = await getIntegrationDataSource()
  })
  afterAll(async () => {
    await closeIntegrationDataSource()
  })
  beforeEach(async () => {
    h = await createSalesSyncHarness(dataSource)
  })

  const ctx = () => ({
    businessId: h.businessId,
    actorId: null,
    businessDate: '2026-10-16',
    at: new Date('2026-10-16T10:00:00.000Z'),
  })
  const movementsOf = (productId: string) =>
    dataSource.query(
      `SELECT quantity_change::float AS change, reference_type AS "referenceType"
         FROM inventory_movements WHERE product_id = $1 ORDER BY created_at`,
      [productId],
    ) as Promise<Array<{ change: number; referenceType: string }>>

  it('writes off a product’s remaining stock and deletes it', async () => {
    const product = await h.seedProduct({ price: 1000, stock: 7 })

    await dataSource.transaction((m) =>
      removeProduct(m, ctx(), { id: product, isSerialized: false }),
    )

    expect(await h.stockOf(product)).toBe(0)
    expect(await movementsOf(product)).toEqual([{ change: -7, referenceType: 'product' }])
    const [row] = (await dataSource.query(
      `SELECT is_active, deleted_at IS NOT NULL AS deleted FROM products WHERE id = $1`,
      [product],
    )) as Array<{ is_active: boolean; deleted: boolean }>
    expect(row).toEqual({ is_active: false, deleted: true })
  })

  it('writes off a variant’s stock and leaves the rest of the product', async () => {
    const product = await h.seedProduct({ price: 1000, stock: 0 })
    await dataSource.query(`UPDATE products SET has_variants = true WHERE id = $1`, [product])
    const variant = async (name: string, stock: number) => {
      const id = randomUUID()
      await dataSource.query(
        `INSERT INTO product_variants (id, business_id, product_id, name) VALUES ($1, $2, $3, $4)`,
        [id, h.businessId, product, name],
      )
      await dataSource.query(
        `INSERT INTO inventory_levels (business_id, product_id, variant_id, quantity) VALUES ($1, $2, $3, $4)`,
        [h.businessId, product, id, stock],
      )
      return id
    }
    const small = await variant('Small', 4)
    await variant('Large', 6)

    await dataSource.transaction((m) =>
      removeVariant(m, ctx(), {
        product: { id: product, isSerialized: false },
        variantId: small,
        reason: 'Removed at the till',
      }),
    )

    expect(await movementsOf(product)).toEqual([{ change: -4, referenceType: 'product_variant' }])
    const levels = (await dataSource.query(
      `SELECT quantity::float AS q FROM inventory_levels WHERE product_id = $1 AND variant_id IS NOT NULL ORDER BY q`,
      [product],
    )) as Array<{ q: number }>
    expect(levels.map((l) => l.q)).toEqual([0, 6])
    const [flags] = (await dataSource.query(`SELECT has_variants FROM products WHERE id = $1`, [
      product,
    ])) as Array<{ has_variants: boolean }>
    expect(flags?.has_variants).toBe(true)
  })

  it('retires an in-stock serial unit as a stock-out of one', async () => {
    const product = await h.seedProduct({ price: 50000, stock: 0 })
    const unit = await h.seedSerialUnit(product, '359874100001234')
    await h.seedSerialUnit(product, '359874100009999')

    await dataSource.transaction((m) =>
      retireSerialUnit(m, ctx(), { id: unit, productId: product, variantId: null }, 'Broken'),
    )

    const [row] = (await dataSource.query(
      `SELECT status, deleted_at IS NOT NULL AS deleted FROM product_serial_units WHERE id = $1`,
      [unit],
    )) as Array<{ status: string; deleted: boolean }>
    expect(row).toEqual({ status: 'DAMAGED', deleted: true })
    expect(await movementsOf(product)).toEqual([{ change: -1, referenceType: 'serial_unit' }])
  })
})
