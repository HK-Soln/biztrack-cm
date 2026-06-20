/* Headless smoke for PurchaseOrderService (+ RFQ→PO convert). Data ops only — the
 * PDF/share path is GUI and tested live. Run with electron-as-node against SQLite. */
import { DatabaseService } from '@biztrack/electron-core'
import { ContactsService } from './contacts.service'
import { RfqService } from './rfq.service'
import { PurchaseOrderService } from './purchase-order.service'
import type { ContactType } from '@biztrack/types'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error('ASSERT FAILED: ' + msg)
  console.log('  ok:', msg)
}

const db = new DatabaseService({ path: ':memory:', migrate: true }) as unknown as DatabaseService
const contacts = new ContactsService(db, () => 'biz-1', () => {})
const rfqs = new RfqService(db, () => 'biz-1', () => {}, () => 'user-1')
const po = new PurchaseOrderService(db, () => 'biz-1', () => {}, () => 'user-1', rfqs)

const sup = contacts.create({ type: 'SUPPLIER' as ContactType, name: 'Acme', phone: '+237600000000' })

console.log('create from scratch…')
const created = po.create({
  supplierId: sup.id,
  title: 'Restock',
  items: [
    { productId: 'p1', description: 'iPhone 15', quantity: 5, unitPrice: 450000 },
    { productId: 'p2', description: 'USB-C Cable', quantity: 20, unitPrice: 2500 },
  ],
})
assert(created.number === 'PO-00001', 'first number PO-00001')
assert(created.status === 'DRAFT', 'starts DRAFT')
assert(created.totalAmount === 5 * 450000 + 20 * 2500, 'total computed from lines')
assert(created.items.length === 2 && created.supplierName === 'Acme', '2 items + supplier name')

console.log('list…')
const list = po.list({})
assert(list.total === 1 && list.data[0]!.itemCount === 2 && list.data[0]!.receivedRatio === 0, 'listed: 2 items, 0% received')

console.log('markSent…')
const sent = po.markSent(created.id)
assert(sent.status === 'SENT' && !!sent.sentAt, 'SENT + sentAt')

console.log('cancel…')
const cancelled = po.cancel(created.id)
assert(cancelled.status === 'CANCELLED', 'cancelled')

console.log('convert from RFQ…')
const rfq = rfqs.create({
  supplierIds: [sup.id],
  items: [
    { productId: 'p1', description: 'iPhone 15', quantity: 3 },
    { productId: 'p2', description: 'USB-C Cable', quantity: 10 },
  ],
})
rfqs.recordQuote(rfq.id, { rfqSupplierId: rfq.suppliers[0]!.id, quotedTotal: 1400000 })
const poFromRfq = po.createFromRfq(rfq.id, {
  rfqSupplierId: rfq.suppliers[0]!.id,
  unitPrices: { [rfq.items[0]!.id]: 450000, [rfq.items[1]!.id]: 2500 },
})
assert(poFromRfq.number === 'PO-00002', 'second PO number')
assert(poFromRfq.rfqId === rfq.id, 'PO links back to the RFQ')
assert(poFromRfq.totalAmount === 3 * 450000 + 10 * 2500, 'PO total from quoted unit prices')
assert(rfqs.get(rfq.id)!.status === 'CONVERTED', 'RFQ marked CONVERTED')

console.log('outbox…')
const ob = db.get<{ payload: string }>(`SELECT payload FROM sync_outbox WHERE entity = 'purchaseOrders' AND record_id = ?`, [poFromRfq.id])!
const payload = JSON.parse(ob.payload)
assert(payload.items.length === 2 && payload.rfqId === rfq.id, 'outbox payload nests items + carries rfqId')
assert(payload.items.every((i: { receivedQuantity: number }) => i.receivedQuantity === 0), 'items start with 0 received')

console.log('\nALL PURCHASE-ORDER SMOKE TESTS PASSED')
process.exit(0)
