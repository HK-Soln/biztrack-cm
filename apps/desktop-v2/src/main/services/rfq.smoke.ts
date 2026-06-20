/* Headless smoke for RfqService (+ ContactsService suppliers). Data ops only — the
 * PDF/share path is GUI and tested live. Run with electron-as-node against SQLite. */
import { DatabaseService } from '@biztrack/electron-core'
import { ContactsService } from './contacts.service'
import { RfqService } from './rfq.service'
import type { ContactType } from '@biztrack/types'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error('ASSERT FAILED: ' + msg)
  console.log('  ok:', msg)
}

const db = new DatabaseService({ path: ':memory:', migrate: true }) as unknown as DatabaseService
const contacts = new ContactsService(db, () => 'biz-1', () => {})
const rfq = new RfqService(db, () => 'biz-1', () => {}, () => 'user-1')

const a = contacts.create({ type: 'SUPPLIER' as ContactType, name: 'Acme', phone: '+237600000000' })
const b = contacts.create({ type: 'SUPPLIER' as ContactType, name: 'Beta', phone: '+237611111111' })

console.log('create…')
const created = rfq.create({
  title: 'Q3 restock',
  messageBody: 'Please quote.',
  supplierIds: [a.id, b.id],
  items: [
    { productId: 'p1', description: 'iPhone 15', quantity: 5 },
    { productId: 'p2', description: 'USB-C Cable', quantity: 20 },
  ],
})
assert(created.number === 'RFQ-00001', 'first number RFQ-00001')
assert(created.status === 'DRAFT', 'starts DRAFT')
assert(created.items.length === 2, '2 items')
assert(created.suppliers.length === 2 && created.suppliers.every((s) => s.status === 'PENDING'), '2 suppliers PENDING')
assert(created.suppliers[0]!.supplierName === 'Acme', 'supplier name resolved')

console.log('list…')
const list = rfq.list({})
assert(list.total === 1, 'one rfq listed')
assert(list.data[0]!.itemCount === 2 && list.data[0]!.supplierCount === 2 && list.data[0]!.quoteCount === 0, 'counts: 2 items / 2 suppliers / 0 quotes')

console.log('buildDocument…')
const doc = rfq.buildDocument(created.id, a.id)
assert(doc.number === 'RFQ-00001' && doc.supplier.name === 'Acme' && doc.items.length === 2, 'document addressed to Acme with 2 items')

console.log('recordQuote…')
const quoted = rfq.recordQuote(created.id, { rfqSupplierId: created.suppliers[0]!.id, quotedTotal: 50000, quoteNotes: '2 weeks' })
assert(quoted.status === 'QUOTED', 'rfq → QUOTED')
assert(quoted.suppliers.find((s) => s.id === created.suppliers[0]!.id)!.status === 'QUOTED', 'supplier → QUOTED')
assert(rfq.list({}).data[0]!.quoteCount === 1, 'quoteCount = 1')

console.log('markSent…')
const sent = rfq.markSent(created.id, [b.id])
assert(sent.suppliers.find((s) => s.supplierId === b.id)!.status === 'SENT', 'Beta → SENT')

console.log('outbox…')
const ob = db.get<{ payload: string }>(`SELECT payload FROM sync_outbox WHERE entity = 'rfqs' AND record_id = ?`, [created.id])!
const payload = JSON.parse(ob.payload)
assert(payload.items.length === 2 && payload.suppliers.length === 2, 'outbox payload nests 2 items + 2 suppliers')
assert(payload.status === 'QUOTED', 'outbox status reflects latest (QUOTED)')
assert(payload.suppliers.some((s: { quotedTotal: number }) => s.quotedTotal === 50000), 'outbox supplier carries the quote')

console.log('\nALL RFQ SMOKE TESTS PASSED')
process.exit(0)
