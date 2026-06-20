/* Headless smoke for SalesService — run with electron-as-node against real SQLite.
 * Bundle via esbuild then run the emitted .cjs. Not part of the build. */
import { randomUUID } from 'crypto'
import { DatabaseService } from '@biztrack/electron-core'
import { SalesService } from './sales.service'
import { DebtsService } from './debts.service'
import { SavingsService } from './savings.service'
import { ProductsService } from './products.service'
import type { SaleInput } from '../../shared/ipc'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error('ASSERT FAILED: ' + msg)
  console.log('  ok:', msg)
}

const db = new DatabaseService({ path: ':memory:', migrate: true }) as unknown as DatabaseService
const BIZ = 'biz-1'
const now = new Date().toISOString()
const debts = new DebtsService(db, () => BIZ, () => {}, () => 'user-1')
const savings = new SavingsService(db, () => BIZ)
const sales = new SalesService(db, () => BIZ, () => {}, () => 'user-1', () => 'Cashier', debts, savings)

// --- seed ------------------------------------------------------------------
function seedProduct(id: string, opts: { price: number; stock?: number; serialized?: boolean }): void {
  db.run(
    `INSERT INTO products (id, business_id, name, slug, price, cost_price, stock_quantity, track_inventory, is_serialized, serial_type, currency, is_deleted, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 'XAF', 0, ?, ?)`,
    [id, BIZ, id.toUpperCase(), id, opts.price, opts.price * 0.6, opts.stock ?? 0, opts.serialized ? 1 : 0, opts.serialized ? 'IMEI' : null, now, now],
  )
}
function seedSerial(id: string, productId: string, serial: string): void {
  db.run(
    `INSERT INTO product_serial_units (id, business_id, product_id, serial_number, serial_type, status, is_deleted, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'IMEI', 'IN_STOCK', 0, ?, ?)`,
    [id, BIZ, productId, serial, now, now],
  )
}
seedProduct('p1', { price: 1000, stock: 10 })
seedProduct('p2', { price: 1000, stock: 10 })
seedProduct('p3', { price: 1000, stock: 10 })
seedProduct('p4', { price: 1000, stock: 10 })
seedProduct('s1', { price: 5000, serialized: true })
seedSerial('su1', 's1', 'IMEI-0001')
seedSerial('su2', 's1', 'IMEI-0002')
db.run(
  `INSERT INTO contacts (id, business_id, type, name, phone, is_active, created_at, updated_at)
   VALUES ('c1', ?, 'CUSTOMER', 'Kemi', '+237600000000', 1, ?, ?)`,
  [BIZ, now, now],
)
db.run(
  `INSERT INTO savings_accounts (id, business_id, customer_id, customer_name, account_number, balance, total_deposited, total_refunded, total_used, is_deleted, created_at, updated_at)
   VALUES ('sav1', ?, 'c1', 'Kemi', 'DEP-001', 3000, 3000, 0, 0, 0, ?, ?)`,
  [BIZ, now, now],
)
const stock = (id: string) => db.get<{ q: number }>(`SELECT stock_quantity AS q FROM products WHERE id = ?`, [id])!.q
const outbox = (id: string) =>
  JSON.parse(db.query<{ payload: string }>(`SELECT payload FROM sync_outbox WHERE entity = 'sales' AND record_id = ?`, [id])[0].payload)

console.log('cash sale…')
const cash = sales.createSale({
  clientId: randomUUID(), items: [{ productId: 'p1', quantity: 2, unitPrice: 1000 }],
  payments: [{ method: 'CASH' as never, amount: 2000 }],
})
assert(cash.totalAmount === 2000 && cash.amountPaid === 2000 && cash.creditAmount === 0, 'cash totals: 2000 paid, 0 credit')
assert(cash.changeGiven === 0, 'no change')
assert(stock('p1') === 8, 'stock decremented 10 → 8')
assert(db.query(`SELECT 1 FROM inventory_movements WHERE reference_id = ? AND type = 'SALE'`, [cash.id]).length === 1, 'SALE movement written')
assert(cash.saleNumber.startsWith('VTE-'), 'sale number VTE-…')
const cashPayload = outbox(cash.id)
assert(cashPayload.items.length === 1 && cashPayload.items[0].quantity === 2, 'outbox carries items')
assert(cashPayload.payments.length === 1 && cashPayload.payments[0].amount === 2000, 'outbox carries payments')
assert(cashPayload.clientId && cashPayload.saleNumber === cash.saleNumber, 'outbox payload = SaleSyncPayload shape')

console.log('change due…')
const chg = sales.createSale({
  clientId: randomUUID(), items: [{ productId: 'p2', quantity: 1, unitPrice: 1000 }],
  payments: [{ method: 'CASH' as never, amount: 1500 }],
})
assert(chg.amountPaid === 1500 && chg.changeGiven === 500 && chg.creditAmount === 0, 'overpay → 500 change')

console.log('credit sale → receivable…')
const credit = sales.createSale({
  clientId: randomUUID(), customerId: 'c1', items: [{ productId: 'p3', quantity: 1, unitPrice: 1000 }], payments: [],
})
assert(credit.creditAmount === 1000 && credit.amountPaid === 0, 'fully on credit')
assert(credit.paymentMethod === null, 'no payment method on pure credit')
const debtRows = db.query<{ id: string; original_amount: number }>(
  `SELECT id, original_amount FROM debts WHERE business_id = ? AND source_type = 'SALE' AND source_id = ? AND direction = 'RECEIVABLE'`,
  [BIZ, credit.id],
)
assert(debtRows.length === 1, 'exactly ONE receivable debt (trigger + service no dup)')
assert(debtRows[0].original_amount === 1000, 'receivable = credit amount')

console.log('credit requires a customer…')
let blocked = false
try {
  sales.createSale({ clientId: randomUUID(), items: [{ productId: 'p4', quantity: 1, unitPrice: 1000 }], payments: [{ method: 'CASH' as never, amount: 400 }] })
} catch { blocked = true }
assert(blocked, 'a shortfall with no customer is rejected')

console.log('serialized sale marks units SOLD…')
const serial = sales.createSale({
  clientId: randomUUID(), items: [{ productId: 's1', quantity: 1, unitPrice: 5000, serialUnitIds: ['su1'] }],
  payments: [{ method: 'CARD' as never, amount: 5000 }],
})
assert(db.get<{ s: string }>(`SELECT status AS s FROM product_serial_units WHERE id = 'su1'`)!.s === 'SOLD', 'su1 marked SOLD')
assert(db.get<{ s: string }>(`SELECT status AS s FROM product_serial_units WHERE id = 'su2'`)!.s === 'IN_STOCK', 'su2 still in stock')
assert(serial.items[0].serialNumber === 'IMEI-0001', 'sale item snapshots the serial number')
assert(db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM product_serial_units WHERE product_id = 's1' AND status = 'IN_STOCK'`)!.n === 1, 'serial stock now 1')

console.log('charges + discounts…')
const settled = sales.createSale({
  clientId: randomUUID(), items: [{ productId: 'p1', quantity: 1, unitPrice: 1000 }],
  charges: [{ name: 'Transport', rateType: 'FIXED', rateValue: 200, amount: 200 }],
  discounts: [{ description: 'Remise', discountType: 'FIXED_AMOUNT', rate: null, amount: 100 }],
  payments: [{ method: 'CASH' as never, amount: 1100 }],
})
assert(settled.subtotal === 1000 && settled.discountAmount === 100 && settled.chargesAmount === 200 && settled.totalAmount === 1100, 'subtotal − discount + charges = total')
assert(db.query(`SELECT 1 FROM sale_charges WHERE sale_id = ?`, [settled.id]).length === 1, 'charge row persisted')
assert(db.query(`SELECT 1 FROM sale_discounts WHERE sale_id = ?`, [settled.id]).length === 1, 'discount row persisted')
const sp = outbox(settled.id)
assert(sp.charges.length === 1 && sp.discounts.length === 1, 'charges + discounts ride the outbox payload')

console.log('deposit (savings) payment…')
const dep = sales.createSale({
  clientId: randomUUID(), customerId: 'c1',
  items: [{ productId: 'p2', quantity: 2, unitPrice: 1000 }], // total 2000
  payments: [{ method: 'SAVINGS' as never, amount: 2000, savingsAccountId: 'sav1' }],
})
assert(dep.amountPaid === 2000 && dep.creditAmount === 0, 'deposit covers the sale')
assert(db.get<{ b: number }>(`SELECT balance AS b FROM savings_accounts WHERE id = 'sav1'`)!.b === 1000, 'savings balance 3000 → 1000')
assert(db.get<{ u: number }>(`SELECT total_used AS u FROM savings_accounts WHERE id = 'sav1'`)!.u === 2000, 'total_used = 2000')
assert(db.query(`SELECT 1 FROM savings_transactions WHERE sale_id = ? AND type = 'sale' AND direction = 'outbound'`, [dep.id]).length === 1, 'outbound savings transaction recorded')
assert(db.query(`SELECT 1 FROM sync_outbox WHERE entity = 'savingsTransactions'`).length >= 1, 'savings transaction enqueued')
assert(db.query(`SELECT 1 FROM sync_outbox WHERE entity = 'savings' AND record_id = 'sav1'`).length === 1, 'updated savings account enqueued')

console.log('deposit shortfall rejected…')
let depBlocked = false
try {
  sales.createSale({ clientId: randomUUID(), customerId: 'c1', items: [{ productId: 'p2', quantity: 5, unitPrice: 1000 }], payments: [{ method: 'SAVINGS' as never, amount: 5000, savingsAccountId: 'sav1' }] })
} catch { depBlocked = true }
assert(depBlocked, 'paying more than the deposit balance is rejected')
assert(db.get<{ b: number }>(`SELECT balance AS b FROM savings_accounts WHERE id = 'sav1'`)!.b === 1000, 'balance unchanged after rejected sale')

console.log('idempotent on clientId…')
const cid = randomUUID()
const a = sales.createSale({ clientId: cid, items: [{ productId: 'p1', quantity: 1, unitPrice: 1000 }], payments: [{ method: 'CASH' as never, amount: 1000 }] })
const b = sales.createSale({ clientId: cid, items: [{ productId: 'p1', quantity: 1, unitPrice: 1000 }], payments: [{ method: 'CASH' as never, amount: 1000 }] })
assert(a.id === b.id, 'same clientId returns the same sale')
assert(db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM sales WHERE client_id = ?`, [cid])!.n === 1, 'no duplicate sale row')

console.log('scan resolution…')
const productsSvc = new ProductsService(db, () => BIZ, () => {})
db.run(`UPDATE products SET barcode = '6001234500017', sku = 'RICE-5KG' WHERE id = 'p1'`)
const byBarcode = productsSvc.resolveScan('6001234500017')
assert(byBarcode?.kind === 'product' && byBarcode.product.id === 'p1', 'resolves a product by barcode')
const bySku = productsSvc.resolveScan('RICE-5KG')
assert(bySku?.kind === 'product' && bySku.product.id === 'p1', 'resolves a product by SKU')
const bySerial = productsSvc.resolveScan('IMEI-0002')
assert(bySerial?.kind === 'serial' && bySerial.serial.id === 'su2', 'resolves an in-stock serial')
assert(productsSvc.resolveScan('IMEI-0001') === null, 'a SOLD serial does not resolve')
assert(productsSvc.resolveScan('nope-xyz') === null, 'unknown code → null')
assert(productsSvc.listInStockSerials('s1', null, 'IMEI').length === 1, 'serial search filters in-stock units')

console.log('history list…')
const list = sales.list({})
assert(list.total >= 6 && list.data[0]!.itemCount >= 1, 'list returns sales with item counts')

console.log('\nALL SALES SMOKE TESTS PASSED')
process.exit(0)
// keep tsc happy about the type-only import
export type _ = SaleInput
