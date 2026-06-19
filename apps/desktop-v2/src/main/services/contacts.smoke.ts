/* Headless smoke for ContactsService — run with electron-as-node against real SQLite.
 * Compile via tsconfig.smoke.json then run the emitted .cjs. Not part of the build. */
import { DatabaseService } from '@biztrack/electron-core'
import { ContactsService } from './contacts.service'
import type { ContactType } from '@biztrack/types'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error('ASSERT FAILED: ' + msg)
  console.log('  ok:', msg)
}

const db = new DatabaseService({ path: ':memory:', migrate: true }) as unknown as DatabaseService
let mutated = 0
const svc = new ContactsService(db, () => 'biz-1', () => { mutated++ })

const SUPPLIER = 'SUPPLIER' as ContactType
const CUSTOMER = 'CUSTOMER' as ContactType

console.log('create…')
const a = svc.create({ type: SUPPLIER, name: 'Acme', phone: '+237600000000' })
const b = svc.create({ type: CUSTOMER, name: 'Bob' })
assert(!!a.id && a.name === 'Acme', 'created supplier')
assert(mutated === 2, 'onMutated fired per create')

console.log('list…')
const list = svc.list({})
assert(list.total === 2, 'list total = 2')
assert((list as { data: unknown[] }).data.length === 2, 'list returned 2 rows')

console.log('pickers…')
assert(svc.listAllSuppliers().length === 1, 'one supplier in picker')
assert(svc.listAllCustomers().length === 1, 'one customer in picker')

console.log('type filter…')
assert(svc.list({ type: CUSTOMER }).total === 1, 'customer filter = 1')

console.log('get + zero balances…')
const got = svc.get(a.id)!
assert(got.totalPayable === 0 && got.totalReceivable === 0 && got.openDebts === 0, 'zero balances initially')

console.log('update…')
const u = svc.update(a.id, { name: 'Acme Ltd', phone: '+237611111111' })
assert(u.name === 'Acme Ltd' && u.phone === '+237611111111', 'updated name + phone')

console.log('outbox…')
const ob = db.query<{ entity: string; record_id: string; operation: string; payload: string }>(
  `SELECT entity, record_id, operation, payload FROM sync_outbox WHERE entity = 'contacts' AND record_id = ?`,
  [a.id],
)
assert(ob.length === 1, 'one coalesced outbox row for the supplier')
const payload = JSON.parse(ob[0].payload)
assert(payload.businessId === 'biz-1' && payload.type === 'SUPPLIER' && payload.name === 'Acme Ltd', 'outbox payload carries latest state')

console.log('payable balance via debt…')
const now = new Date().toISOString()
db.run(
  `INSERT INTO debts (id, business_id, contact_id, direction, source_type, source_id, source_reference, original_amount, status, created_at)
   VALUES ('d1','biz-1',?, 'PAYABLE','RESTOCK','r1','REF-1',5000,'OUTSTANDING',?)`,
  [a.id, now],
)
const got2 = svc.get(a.id)!
assert(got2.totalPayable === 5000 && got2.openDebts === 1, 'payable shows 5000 / 1 open')

db.run(
  `INSERT INTO debt_payments (id, business_id, debt_id, amount, method, payment_date, recorded_by, created_at)
   VALUES ('p1','biz-1','d1',2000,'CASH',?,'user-1',?)`,
  [now, now],
)
const got3 = svc.get(a.id)!
assert(got3.totalPayable === 3000, 'payable reduced to 3000 after partial payment')

console.log('remove blocked by open debt…')
let blocked = false
try { svc.remove(a.id) } catch { blocked = true }
assert(blocked, 'cannot remove a contact with open debts')

console.log('remove (deactivate) the debt-free customer…')
svc.remove(b.id)
const afterDel = svc.get(b.id)!
assert(afterDel.isActive === false, 'customer deactivated, history kept')

console.log('\nALL CONTACTS SMOKE TESTS PASSED')
process.exit(0)
