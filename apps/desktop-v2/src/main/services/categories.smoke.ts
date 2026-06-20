/* Headless smoke for CategoriesService eligibility (selectable leaves + parent options),
 * brand any-level links expanding to leaves, and the product leaf guard. Run with
 * electron-as-node against real SQLite. Not part of the build. */
import { randomUUID } from 'crypto'
import { DatabaseService } from '@biztrack/electron-core'
import { CategoriesService } from './categories.service'
import { BrandsService } from './brands.service'
import { ProductsService } from './products.service'
import type { ProductInput } from '../../shared/ipc'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error('ASSERT FAILED: ' + msg)
  console.log('  ok:', msg)
}
function assertThrows(fn: () => unknown, msg: string): void {
  let threw = false
  try {
    fn()
  } catch {
    threw = true
  }
  assert(threw, msg)
}

const db = new DatabaseService({ path: ':memory:', migrate: true }) as unknown as DatabaseService
const BIZ = 'biz-1'
const cats = new CategoriesService(db, () => BIZ, () => {})
const brands = new BrandsService(db, () => BIZ, () => {})
const products = new ProductsService(db, () => BIZ, () => {})

const ids = (rows: { id: string }[]) => new Set(rows.map((r) => r.id))

// A valid unit of measure so product-create reaches the category guard.
const UNIT = 'unit-1'
db.run(
  `INSERT INTO unit_of_measures (id, name, abbreviation, business_id, type, is_active, is_deleted, is_default, created_at, updated_at)
   VALUES (?, 'Piece', 'pc', ?, 'COUNT', 1, 0, 1, ?, ?)`,
  [UNIT, BIZ, new Date().toISOString(), new Date().toISOString()],
)

console.log('simple top-level category is selectable…')
const accessories = cats.create({ name: 'Accessories' }) // L1 leaf, no parent, no attrs
assert(ids(cats.listSelectable()).has(accessories.id), 'a simple L1 category (no children) is selectable')

console.log('branch hides, leaves show…')
const elec = cats.create({ name: 'Electronics' }) // L1
const phones = cats.create({ name: 'Phones', parentId: elec.id }) // L2 leaf
let sel = ids(cats.listSelectable())
assert(sel.has(phones.id), 'L2 leaf is selectable')
assert(!sel.has(elec.id), 'L1 branch (has child) is NOT selectable')

console.log('deeper leaf replaces its parent…')
const android = cats.create({ name: 'Android', parentId: phones.id }) // L3 leaf
sel = ids(cats.listSelectable())
assert(sel.has(android.id), 'L3 leaf is selectable')
assert(!sel.has(phones.id), 'L2 becomes a branch once it has a child — not selectable')

console.log('parent options: depth + self/descendant rules…')
let po = ids(cats.listParentOptions())
assert(po.has(elec.id) && po.has(phones.id), 'depth<3 categories are valid parents')
assert(!po.has(android.id), 'a depth-3 category cannot be a parent')
// excludeId removes the node and its descendants
po = ids(cats.listParentOptions({ excludeId: elec.id }))
assert(!po.has(elec.id) && !po.has(phones.id) && !po.has(android.id), 'excludeId drops self + descendants')

console.log('a category with products cannot become a parent…')
db.run(
  `INSERT INTO products (id, business_id, name, slug, price, currency, unit_of_measure_id, category_id, is_deleted, created_at, updated_at)
   VALUES (?, ?, 'P1', 'p1', 1000, 'XAF', 'u1', ?, 0, ?, ?)`,
  [randomUUID(), BIZ, accessories.id, new Date().toISOString(), new Date().toISOString()],
)
assertThrows(() => cats.create({ name: 'Sub of Accessories', parentId: accessories.id }), 'create child under a category with products throws')
assert(!ids(cats.listParentOptions()).has(accessories.id), 'category with products is excluded from parent options')
assert(ids(cats.listSelectable()).has(accessories.id), 'category with products is still a selectable leaf')

console.log('a category with variant options cannot become a parent…')
const bags = cats.create({ name: 'Bags' }) // L1 leaf
db.run(
  `INSERT INTO category_attribute_groups (id, business_id, category_id, attribute_group_id, is_required, sort_order, is_deleted, created_at, updated_at)
   VALUES (?, ?, ?, 'grp-1', 1, 0, 0, ?, ?)`,
  [randomUUID(), BIZ, bags.id, new Date().toISOString(), new Date().toISOString()],
)
assertThrows(() => cats.create({ name: 'Sub of Bags', parentId: bags.id }), 'create child under a category with variant options throws')
assert(!ids(cats.listParentOptions()).has(bags.id), 'category with variant options is excluded from parent options')

console.log('depth-3 cannot be a parent (max depth)…')
assertThrows(() => cats.create({ name: 'Too deep', parentId: android.id }), 'create child under a depth-3 category throws')

console.log('brand links any level; product picker expands to leaves…')
const samsung = brands.create({ name: 'Samsung', categoryIds: [elec.id] }) // link the L1 branch
const bsel = ids(cats.listSelectable({ brandId: samsung.id }))
assert(bsel.has(android.id) && bsel.size === 1, 'linking an L1 branch expands to its single leaf (android)')

const generic = brands.create({ name: 'Generic', categoryIds: [accessories.id] }) // link a leaf directly
const bsel2 = ids(cats.listSelectable({ brandId: generic.id }))
assert(bsel2.has(accessories.id) && bsel2.size === 1, 'linking a leaf yields exactly that leaf')

console.log('zero-category brand surfaces all leaves…')
const noCat = brands.create({ name: 'NoCats', categoryIds: [] }) // categories optional
assert(noCat.categoryIds.length === 0, 'brand can be created with no categories')
const allLeaves = ids(cats.listSelectable())
const bsel3 = ids(cats.listSelectable({ brandId: noCat.id }))
assert(bsel3.size === allLeaves.size && [...allLeaves].every((id) => bsel3.has(id)), 'a brand with no links surfaces every terminal category')

console.log('product guard: cannot place a product in a branch category…')
const branchInput = { name: 'Bad', sellingPrice: 1000, unitOfMeasureId: UNIT, categoryId: elec.id } as ProductInput
assertThrows(() => products.create(branchInput), 'creating a product in a branch (non-leaf) category throws')

console.log('product guard: unit of measure is required…')
const noUnit = { name: 'NoUnit', sellingPrice: 1000, unitOfMeasureId: '', categoryId: accessories.id } as ProductInput
assertThrows(() => products.create(noUnit), 'creating a product with no unit throws')
const badUnit = { name: 'BadUnit', sellingPrice: 1000, unitOfMeasureId: 'does-not-exist', categoryId: accessories.id } as ProductInput
assertThrows(() => products.create(badUnit), 'creating a product with a non-existent unit throws')

console.log('\nALL CATEGORIES SMOKE TESTS PASSED')
process.exit(0)
