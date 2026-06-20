/* Headless smoke for restock-from-PO (direct + variant + serial + credit + PO receive).
 * Run with electron-as-node against real SQLite. */
import { DatabaseService } from '@biztrack/electron-core'
import { ContactsService } from './contacts.service'
import { DebtsService } from './debts.service'
import { ProductsService } from './products.service'
import { RfqService } from './rfq.service'
import { PurchaseOrderService } from './purchase-order.service'
import { InventoryService } from './inventory.service'
import { effectiveStock } from './stock-ledger'
import type { ContactType, SerialType } from '@biztrack/types'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error('ASSERT FAILED: ' + msg)
  console.log('  ok:', msg)
}

const db = new DatabaseService({ path: ':memory:', migrate: true }) as unknown as DatabaseService
const biz = () => 'biz-1'
const noop = () => {}
const actor = () => 'user-1'
const products = new ProductsService(db, biz, noop)
const contacts = new ContactsService(db, biz, noop)
const debts = new DebtsService(db, biz, noop, actor)
const rfqs = new RfqService(db, biz, noop, actor)
const purchaseOrders = new PurchaseOrderService(db, biz, noop, actor, rfqs)
const inventory = new InventoryService(db, biz, noop, products, debts, purchaseOrders)

// A unit of measure (products reference one).
db.run(`INSERT INTO unit_of_measures (id, business_id, name, abbreviation, type, is_default, is_active, is_deleted, created_at, updated_at) VALUES ('u1','biz-1','Piece','pc','QUANTITY',1,1,0,?,?)`, [new Date().toISOString(), new Date().toISOString()])

console.log('setup products…')
const direct = products.create({ name: 'Widget', sellingPrice: 1000, costPrice: 600, unitOfMeasureId: 'u1' })
const serialized = products.create({ name: 'Phone', sellingPrice: 50000, unitOfMeasureId: 'u1', isSerialized: true, serialType: 'IMEI' as SerialType })
const variantParent = products.create({ name: 'Shirt', sellingPrice: 5000, costPrice: 4000, unitOfMeasureId: 'u1' })
const variant = products.addVariant(variantParent.id, { name: 'Shirt / M', options: [], openingStock: 0 })

// A serialized product that also has variants (the case the receive UI must handle).
const serialVar = products.create({ name: 'Laptop', sellingPrice: 300000, unitOfMeasureId: 'u1', isSerialized: true, serialType: 'SERIAL_NUMBER' as SerialType })
const serialVarA = products.addVariant(serialVar.id, { name: 'Laptop / 8GB', options: [] })

const supplier = contacts.create({ type: 'SUPPLIER' as ContactType, name: 'Acme', phone: '+237600000000' })

console.log('create PO (orders more than will be received for the serial line)…')
const po = purchaseOrders.create({
  supplierId: supplier.id,
  items: [
    { productId: direct.id, quantity: 5, unitPrice: 600 },
    { productId: variantParent.id, variantId: variant.id, quantity: 3, unitPrice: 4000 },
    { productId: serialized.id, quantity: 4, unitPrice: 45000 },
  ],
})

console.log('restock from PO (partial serial delivery, on credit)…')
inventory.restock({
  purchaseOrderId: po.id,
  supplierId: supplier.id,
  amountPaid: 100000, // total = 5*600+3*4000+2*45000 = 105000 -> credit 5000
  reference: 'GRN-1',
  invoiceFileUrl: 'https://example.test/inv-grn-1.pdf', // required when on credit
  invoiceNumber: 'INV-GRN-1',
  items: [
    { productId: direct.id, quantity: 5, unitCost: 600 },
    { productId: variantParent.id, variantId: variant.id, quantity: 3, unitCost: 4000 },
    { productId: serialized.id, serialNumbers: ['SN-1', 'SN-2'], unitCost: 45000 },
  ],
})

console.log('stock updated per kind…')
assert(effectiveStock(db, direct.id) === 5, 'direct stock = 5')
assert(effectiveStock(db, variantParent.id) === 3, 'variant stock = 3')
assert(effectiveStock(db, serialized.id) === 2, 'serialized stock = 2 (serial units created)')

console.log('PO received quantities + status…')
const poAfter = purchaseOrders.get(po.id)!
const recv = (pid: string) => poAfter.items.find((i) => i.productId === pid)!.receivedQuantity
assert(recv(direct.id) === 5 && recv(variantParent.id) === 3 && recv(serialized.id) === 2, 'received 5 / 3 / 2')
assert(poAfter.status === 'PARTIALLY_RECEIVED', 'PO PARTIALLY_RECEIVED (serial line under-delivered)')

console.log('credit → supplier payable…')
const debtList = debts.listByContact(supplier.id)
assert(debtList.total === 1, 'one payable created')
assert(debtList.data[0]!.direction === 'PAYABLE' && debtList.data[0]!.outstandingAmount === 5000, 'payable 5000 outstanding')
const c = contacts.get(supplier.id)!
assert(c.totalPayable === 5000, 'contact shows 5000 payable')

console.log('restock record + outbox…')
const rec = db.get<{ purchase_order_id: string | null; credit_amount: number; amount_paid: number }>(`SELECT purchase_order_id, credit_amount, amount_paid FROM restock_records LIMIT 1`)!
assert(rec.purchase_order_id === po.id && rec.credit_amount === 5000 && rec.amount_paid === 100000, 'restock record links PO + records credit')
const ob = db.get<{ payload: string }>(`SELECT payload FROM sync_outbox WHERE entity = 'inventoryRestocks' LIMIT 1`)!
const payload = JSON.parse(ob.payload)
assert(payload.purchaseOrderId === po.id && payload.amountPaid === 100000, 'outbox carries PO link + amountPaid')
assert(payload.items.some((i: { variantId?: string }) => i.variantId === variant.id), 'outbox variant item carries variantId')
assert(rec.amount_paid === 100000, 'grn1 amount paid')
const grn1 = db.get<{ total_cost: number; total_amount: number; discount_amount: number; charges_amount: number; invoice_file_url: string | null }>(
  `SELECT total_cost, total_amount, discount_amount, charges_amount, invoice_file_url FROM restock_records WHERE reference_number = 'GRN-1'`,
)!
assert(grn1.total_cost === 105000 && grn1.total_amount === 105000 && grn1.discount_amount === 0 && grn1.charges_amount === 0, 'grn1 subtotal=total=105000, no adj')
assert(grn1.invoice_file_url === 'https://example.test/inv-grn-1.pdf', 'grn1 invoice file stored')

console.log('\nsettlement: ad-hoc receipt with discount + charge + split payment + invoice…')
inventory.restock({
  supplierId: supplier.id,
  reference: 'GRN-2',
  // goods subtotal = 10 * 600 = 6000
  items: [{ productId: direct.id, quantity: 10, unitCost: 600 }],
  // − 600 discount + 1000 transport charge => invoice total = 6400
  discounts: [{ description: 'Remise', discountType: 'FIXED_AMOUNT', amount: 600 }],
  charges: [{ name: 'Transport', rateType: 'FIXED', rateValue: 1000, amount: 1000 }],
  // split: 4000 cash + 2000 MoMo = 6000 paid => credit 400
  payments: [
    { method: 'CASH' as never, amount: 4000 },
    { method: 'MTN_MOMO' as never, amount: 2000, mobileMoneyReference: 'TX-1' },
  ],
  invoiceNumber: 'INV-GRN-2',
  invoiceDate: '2026-06-20',
  invoiceFileUrl: 'https://example.test/inv-grn-2.pdf',
})

const grn2 = db.get<{ id: string; total_cost: number; discount_amount: number; charges_amount: number; total_amount: number; amount_paid: number; credit_amount: number; invoice_number: string | null }>(
  `SELECT id, total_cost, discount_amount, charges_amount, total_amount, amount_paid, credit_amount, invoice_number FROM restock_records WHERE reference_number = 'GRN-2'`,
)!
assert(grn2.total_cost === 6000, 'grn2 subtotal 6000')
assert(grn2.discount_amount === 600 && grn2.charges_amount === 1000, 'grn2 discount 600 + charge 1000')
assert(grn2.total_amount === 6400, 'grn2 invoice total 6400')
assert(grn2.amount_paid === 6000 && grn2.credit_amount === 400, 'grn2 paid 6000, credit 400')
assert(grn2.invoice_number === 'INV-GRN-2', 'grn2 invoice number stored')

const grn2Charges = db.query<{ name: string; amount: number }>(`SELECT name, amount FROM restock_charges WHERE restock_record_id = ?`, [grn2.id])
const grn2Discounts = db.query<{ amount: number }>(`SELECT amount FROM restock_discounts WHERE restock_record_id = ?`, [grn2.id])
const grn2Payments = db.query<{ method: string; amount: number }>(`SELECT method, amount FROM restock_payments WHERE restock_record_id = ?`, [grn2.id])
assert(grn2Charges.length === 1 && grn2Charges[0]!.name === 'Transport', 'grn2 one charge row')
assert(grn2Discounts.length === 1 && grn2Discounts[0]!.amount === 600, 'grn2 one discount row')
assert(grn2Payments.length === 2, 'grn2 two payment rows')

const grn2Ob = db.get<{ payload: string }>(`SELECT payload FROM sync_outbox WHERE record_id = ?`, [grn2.id])!
const grn2Payload = JSON.parse(grn2Ob.payload)
assert(grn2Payload.charges?.length === 1 && grn2Payload.discounts?.length === 1 && grn2Payload.payments?.length === 2, 'grn2 outbox carries charges/discounts/payments')
assert(grn2Payload.invoiceFileUrl === 'https://example.test/inv-grn-2.pdf' && grn2Payload.totalAmount === 6400, 'grn2 outbox carries invoice + total')

console.log('serialized variants: serials tied to their variant…')
inventory.restock({
  supplierId: supplier.id,
  reference: 'GRN-4',
  invoiceFileUrl: 'https://example.test/inv-grn-4.pdf',
  items: [
    { productId: serialVar.id, variantId: serialVarA.id, serialNumbers: ['LAP-A1', 'LAP-A2'], unitCost: 200000 },
  ],
  payments: [{ method: 'CASH' as never, amount: 400000 }],
})
const svUnits = db.query<{ serial_number: string; variant_id: string | null }>(
  `SELECT serial_number, variant_id FROM product_serial_units WHERE product_id = ? AND is_deleted = 0 ORDER BY serial_number`,
  [serialVar.id],
)
assert(svUnits.length === 2, 'serialized-variant: 2 units created')
assert(svUnits.every((u) => u.variant_id === serialVarA.id), 'each serial tied to its variant')
const svMoveTypes = db.query<{ type: string }>(`SELECT type FROM inventory_movements WHERE product_id = ?`, [serialVar.id])
assert(svMoveTypes.length > 0 && svMoveTypes.every((m) => m.type === 'RESTOCK_IN'), 'serialized receive logs RESTOCK_IN (not adjustment)')
const directMove = db.get<{ type: string }>(`SELECT type FROM inventory_movements WHERE product_id = ? AND reference_type = 'restock' LIMIT 1`, [direct.id])!
assert(directMove.type === 'RESTOCK_IN', 'direct receive logs RESTOCK_IN')

console.log('settlement: credit receipt without invoice is rejected…')
let rejected = false
try {
  inventory.restock({
    supplierId: supplier.id,
    reference: 'GRN-3',
    items: [{ productId: direct.id, quantity: 1, unitCost: 600 }],
    payments: [{ method: 'CASH' as never, amount: 0 }], // nothing paid -> full credit, no invoice
  })
} catch {
  rejected = true
}
assert(rejected, 'credit receipt without an invoice is rejected')

console.log('\nALL RESTOCK-FROM-PO SMOKE TESTS PASSED')
process.exit(0)
