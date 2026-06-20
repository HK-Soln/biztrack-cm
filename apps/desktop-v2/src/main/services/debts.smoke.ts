/* Headless smoke for DebtsService (+ ContactsService balance cross-check).
 * Run with electron-as-node against real SQLite. Not part of the build. */
import { DatabaseService } from '@biztrack/electron-core'
import { ContactsService } from './contacts.service'
import { DebtsService } from './debts.service'
import type { ContactType } from '@biztrack/types'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error('ASSERT FAILED: ' + msg)
  console.log('  ok:', msg)
}

const db = new DatabaseService({ path: ':memory:', migrate: true }) as unknown as DatabaseService
const contacts = new ContactsService(db, () => 'biz-1', () => {})
const debts = new DebtsService(db, () => 'biz-1', () => {}, () => 'user-1')

const sup = contacts.create({ type: 'SUPPLIER' as ContactType, name: 'Acme' })

console.log('createSourceDebt (payable)…')
const dId = debts.createSourceDebt({
  contactId: sup.id, direction: 'PAYABLE', sourceType: 'RESTOCK', sourceId: 'r1', sourceReference: 'RST-1', originalAmount: 10000,
})
assert(!!dId, 'debt created')
const dId2 = debts.createSourceDebt({
  contactId: sup.id, direction: 'PAYABLE', sourceType: 'RESTOCK', sourceId: 'r1', sourceReference: 'RST-1', originalAmount: 10000,
})
assert(dId2 === dId, 'createSourceDebt is idempotent per source')

console.log('contact balance reflects payable…')
const c = contacts.get(sup.id)!
assert(c.totalPayable === 10000 && c.openDebts === 1, 'supplier shows 10000 payable / 1 open')

console.log('listByContact…')
const list = debts.listByContact(sup.id)
assert(list.total === 1, 'one debt listed')
assert(list.data[0]!.outstandingAmount === 10000 && list.data[0]!.status === 'OUTSTANDING', 'outstanding 10000 / OUTSTANDING')

console.log('partial payment…')
const after1 = debts.recordPayment(dId, { amount: 4000, method: 'CASH' as never, paymentDate: new Date().toISOString() })
assert(after1.paidAmount === 4000 && after1.outstandingAmount === 6000 && after1.status === 'PARTIALLY_PAID', 'partial → 6000 outstanding / PARTIALLY_PAID')

console.log('overpayment rejected…')
let rej = false
try { debts.recordPayment(dId, { amount: 99999, method: 'CASH' as never, paymentDate: '' }) } catch { rej = true }
assert(rej, 'cannot pay more than outstanding')

console.log('full payment settles…')
const after2 = debts.recordPayment(dId, { amount: 6000, method: 'MTN_MOMO' as never, paymentDate: '', mobileMoneyReference: 'TX1' })
assert(after2.status === 'SETTLED' && after2.outstandingAmount === 0, 'fully paid → SETTLED / 0 outstanding')
assert(!!after2.settledAt, 'settledAt set')

console.log('contact balance cleared…')
const c2 = contacts.get(sup.id)!
assert(c2.totalPayable === 0 && c2.openDebts === 0, 'supplier balance back to 0 / 0 open')

console.log('outbox carries nested payments…')
const ob = db.get<{ payload: string }>(`SELECT payload FROM sync_outbox WHERE entity = 'debts' AND record_id = ?`, [dId])!
const payload = JSON.parse(ob.payload)
assert(payload.payments.length === 2 && payload.status === 'SETTLED', 'debt outbox payload has 2 payments + SETTLED')
assert(payload.direction === 'PAYABLE' && payload.contactId === sup.id, 'debt outbox payload carries direction + contact')

console.log('statement (ledger)…')
const stmt = debts.statement(sup.id, 'PAYABLE' as never)
assert(stmt.entries.length === 3, 'statement: 1 purchase + 2 payments = 3 entries')
assert(stmt.openingBalance === 0 && stmt.closingBalance === 0, 'statement opening 0 / closing 0')
assert(stmt.entries.reduce((s, e) => s + e.debit, 0) === 10000, 'statement total debit 10000')
assert(stmt.entries.reduce((s, e) => s + e.credit, 0) === 10000, 'statement total credit 10000')
assert(stmt.entries[0]!.type === 'DEBT_CREATED' && stmt.entries[0]!.balance === 10000, 'first entry is the purchase, balance 10000')

console.log('\nALL DEBTS SMOKE TESTS PASSED')
process.exit(0)
