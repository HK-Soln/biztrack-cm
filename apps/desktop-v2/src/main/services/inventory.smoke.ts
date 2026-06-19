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

console.log('\nALL RESTOCK-FROM-PO SMOKE TESTS PASSED')
process.exit(0)
