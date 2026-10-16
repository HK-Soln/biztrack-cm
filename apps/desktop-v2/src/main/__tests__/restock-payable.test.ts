import { beforeEach, describe, expect, it } from 'vitest'
import type { ContactType } from '@biztrack/types'
import type { DatabaseService } from '@biztrack/electron-core'
import { createTestDatabase } from '@biztrack/electron-core/testing'
import { ContactsService } from '../services/contacts.service'
import { DebtsService } from '../services/debts.service'
import { InventoryService } from '../services/inventory.service'
import { ProductsService } from '../services/products.service'
import { PurchaseOrderService } from '../services/purchase-order.service'
import { RfqService } from '../services/rfq.service'

// A restock with a balance on credit leaves a supplier payable. A SQLite trigger used to
// create it; the restock code does now (slice 6), and this pins the result.

const BIZ = 'biz-1'
const NOW = '2026-08-28T12:00:00.000Z'

describe('a restock and its supplier payable on the till', () => {
  let db: DatabaseService
  let inventory: InventoryService
  let productId: string
  let supplierId: string

  beforeEach(() => {
    db = createTestDatabase()
    const biz = () => BIZ
    const noop = () => {}
    const actor = () => 'u-1'
    db.run(
      `INSERT INTO unit_of_measures (id, business_id, name, abbreviation, type, is_default, is_active, is_deleted, created_at, updated_at)
       VALUES ('u1', ?, 'Piece', 'pc', 'QUANTITY', 1, 1, 0, ?, ?)`,
      [BIZ, NOW, NOW],
    )
    const products = new ProductsService(db, biz, noop)
    const debts = new DebtsService(db, biz, noop, actor)
    const purchaseOrders = new PurchaseOrderService(
      db,
      biz,
      noop,
      actor,
      new RfqService(db, biz, noop, actor),
    )
    inventory = new InventoryService(db, biz, noop, products, debts, purchaseOrders)
    productId = products.create({
      name: 'Widget',
      sellingPrice: 1000,
      costPrice: 600,
      unitOfMeasureId: 'u1',
    }).id
    supplierId = new ContactsService(db, biz, noop).create({
      type: 'SUPPLIER' as ContactType,
      name: 'Acme',
      phone: '+237600000000',
    }).id
  })

  const payables = () =>
    db.query<{
      id: string
      contact_id: string
      original_amount: number
      status: string
      source_id: string
    }>(
      `SELECT id, contact_id, original_amount, status, source_id FROM debts
        WHERE source_type = 'RESTOCK' AND direction = 'PAYABLE'`,
    )
  const debtOutbox = () =>
    db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM sync_outbox WHERE entity = 'debts'`)?.n ?? 0

  it('leaves one payable for the balance, tied to the restock and not pushed on its own', () => {
    // 10 at 600 = 6,000; 2,000 paid, 4,000 on credit.
    inventory.restock({
      supplierId,
      items: [{ productId, quantity: 10, unitCost: 600 }],
      amountPaid: 2000,
      reference: 'GRN-1',
      invoiceFileUrl: 'https://example.test/inv-grn-1.pdf',
    })

    const [payable, ...rest] = payables()
    expect(rest).toHaveLength(0)
    expect(payable).toMatchObject({
      contact_id: supplierId,
      original_amount: 4000,
      status: 'OUTSTANDING',
    })
    // The server creates its own payable when the restock syncs, and pulls back onto this id.
    expect(payable!.id).toBe(`debt:restock:${payable!.source_id}`)
    expect(debtOutbox()).toBe(0)
  })

  it('refuses payments above the invoice total, as the server does', () => {
    expect(() =>
      inventory.restock({
        supplierId,
        items: [{ productId, quantity: 10, unitCost: 600 }],
        payments: [{ method: 'CASH' as never, amount: 7000 }],
        reference: 'GRN-3',
      }),
    ).toThrow('more than the invoice total')
    expect(payables()).toEqual([])
  })

  it('needs the supplier invoice for a receipt on credit', () => {
    expect(() =>
      inventory.restock({
        supplierId,
        items: [{ productId, quantity: 10, unitCost: 600 }],
        amountPaid: 2000,
        reference: 'GRN-4',
      }),
    ).toThrow('Attach the supplier invoice')
  })

  it('leaves no payable when the restock is paid in full', () => {
    inventory.restock({
      supplierId,
      items: [{ productId, quantity: 10, unitCost: 600 }],
      amountPaid: 6000,
      reference: 'GRN-2',
    })
    expect(payables()).toEqual([])
  })
})
