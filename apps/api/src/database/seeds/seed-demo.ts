/**
 * Hypermarket demo seed — a full, realistic store for presentations, ads and video capture.
 *
 * Creates ONE self-contained demo business ("Waypoint Hypermarket") on the PRO plan with a
 * broad catalog (fashion, footwear, electronics, phones, computers, home, groceries, produce,
 * meat, bakery, dairy, beverages, snacks, health & beauty, baby, household, sports, toys,
 * stationery), covering every product shape the POS supports:
 *   - SIMPLE            → product-level inventory_levels row
 *   - VARIABLE_QUANTITY → sold by weight (kg), decimal stock
 *   - variant products  → one product_variants row per option combo, per-variant stock
 *   - serialized        → per-unit product_serial_units (IMEI / serial number)
 * plus contacts (customers + suppliers), expense categories & expenses, ~6 weeks of sales
 * (with payments + inventory movements) and a few outstanding debts, so every dashboard,
 * report and list looks alive.
 *
 * Idempotent: re-running wipes and rebuilds the demo business only (matched by slug), so it is
 * safe to run repeatedly. It NEVER touches any other business.
 *
 * Run:  pnpm --filter @biztrack/api seed:demo
 * Login: demo@waypoint.cm / password123
 */
import 'reflect-metadata'
import * as bcrypt from 'bcryptjs'
import { v4 as uuid } from 'uuid'
import { EntityManager, IsNull } from 'typeorm'
import {
  AttributeDisplayType,
  BillingCycle,
  BusinessMemberRole,
  BusinessMemberStatus,
  BusinessStatus,
  ContactType,
  DebtDirection,
  DebtSource,
  DebtStatus,
  PaymentMethod,
  ProductType,
  SalePaymentKind,
  SaleSource,
  SaleStatus,
  SerialType,
  SerialUnitStatus,
  SubscriptionPlan,
  UnitOfMeasureType,
  UserRole,
} from '@biztrack/types'
import { AppDataSource } from '../data-source'
import { Locale } from '@/common/enums/locale.enum'
import { User, UserStatus } from '@/entities/user.entity'
import { Business, BusinessType, SubscriptionStatus } from '@/entities/business.entity'
import { BusinessMember } from '@/entities/business-member.entity'
import { UnitOfMeasure } from '@/entities/unit-of-measure.entity'
import { ProductCategory } from '@/entities/product-category.entity'
import { AttributeGroup } from '@/entities/attribute-group.entity'
import { AttributeOption } from '@/entities/attribute-option.entity'
import { Brand } from '@/entities/brand.entity'
import { Model } from '@/entities/model.entity'
import { BrandCategory } from '@/entities/brand-category.entity'
import { Product } from '@/entities/product.entity'
import { ProductVariant } from '@/entities/product-variant.entity'
import { ProductVariantOption } from '@/entities/product-variant-option.entity'
import { ProductSerialUnit } from '@/entities/product-serial-unit.entity'
import { InventoryLevel } from '@/entities/inventory-level.entity'
import { InventoryMovement, MovementType } from '@/entities/inventory-movement.entity'
import { Contact } from '@/entities/contact.entity'
import { ExpenseCategory } from '@/entities/expense-category.entity'
import { Expense } from '@/entities/expense.entity'
import { Sale } from '@/entities/sale.entity'
import { SaleItem } from '@/entities/sale-item.entity'
import { SalePayment } from '@/entities/sale-payment.entity'
import { Debt } from '@/entities/debt.entity'

// ─── Demo identity ──────────────────────────────────────────────────────────
const OWNER_EMAIL = 'demo@waypoint.cm'
const OWNER_PHONE = '+237670000000'
const OWNER_PASSWORD = 'Password123!'
const BUSINESS_SLUG = 'waypoint-hypermarket'
const BUSINESS_NAME = 'Waypoint Hypermarket'

// ─── Small deterministic-ish helpers ────────────────────────────────────────
const usedSlugs = new Set<string>()
function slugify(input: string): string {
  const base =
    input
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'item'
  let slug = base
  let n = 2
  while (usedSlugs.has(slug)) slug = `${base}-${n++}`
  usedSlugs.add(slug)
  return slug
}

let barcodeSeq = 6200000000000
function nextBarcode(): string {
  barcodeSeq += 1
  return String(barcodeSeq)
}

let skuSeq = 0
function nextSku(catCode: string): string {
  skuSeq += 1
  return `${catCode}-${String(skuSeq).padStart(4, '0')}`
}

let serialSeq = 0
function nextSerial(type: SerialType): string {
  serialSeq += 1
  if (type === SerialType.IMEI)
    return `35${String(35000000000 + serialSeq).padStart(13, '0')}`.slice(0, 15)
  return `SN${String(serialSeq).padStart(8, '0')}`
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T
}
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}
function dateNDaysAgo(n: number, hour = 10, minute = 0): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(hour, minute, 0, 0)
  return d
}
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// ─── Reference data definitions ─────────────────────────────────────────────
type UnitDef = { key: string; name: string; abbr: string; type: UnitOfMeasureType }
const UNIT_DEFS: UnitDef[] = [
  { key: 'kg', name: 'Kilogram', abbr: 'kg', type: UnitOfMeasureType.WEIGHT },
  { key: 'g', name: 'Gram', abbr: 'g', type: UnitOfMeasureType.WEIGHT },
  { key: 'l', name: 'Litre', abbr: 'L', type: UnitOfMeasureType.VOLUME },
  { key: 'ml', name: 'Millilitre', abbr: 'ml', type: UnitOfMeasureType.VOLUME },
  { key: 'pack', name: 'Pack', abbr: 'pack', type: UnitOfMeasureType.QUANTITY },
  { key: 'box', name: 'Box', abbr: 'box', type: UnitOfMeasureType.QUANTITY },
  { key: 'bottle', name: 'Bottle', abbr: 'btl', type: UnitOfMeasureType.QUANTITY },
  { key: 'carton', name: 'Carton', abbr: 'ctn', type: UnitOfMeasureType.QUANTITY },
  { key: 'pair', name: 'Pair', abbr: 'pr', type: UnitOfMeasureType.QUANTITY },
  { key: 'dozen', name: 'Dozen', abbr: 'dz', type: UnitOfMeasureType.QUANTITY },
  { key: 'crate', name: 'Crate', abbr: 'crt', type: UnitOfMeasureType.QUANTITY },
]

type CatDef = { slug: string; name: string; color: string; icon: string; defaultUnit: string }
const CATEGORIES: CatDef[] = [
  {
    slug: 'fashion-apparel',
    name: 'Fashion & Apparel',
    color: '#EC4899',
    icon: 'shirt',
    defaultUnit: 'pcs',
  },
  { slug: 'footwear', name: 'Footwear', color: '#F97316', icon: 'footprints', defaultUnit: 'pair' },
  { slug: 'electronics', name: 'Electronics', color: '#3B82F6', icon: 'tv', defaultUnit: 'pcs' },
  {
    slug: 'mobile-phones',
    name: 'Mobile Phones & Accessories',
    color: '#6366F1',
    icon: 'smartphone',
    defaultUnit: 'pcs',
  },
  {
    slug: 'computers-office',
    name: 'Computers & Office',
    color: '#0EA5E9',
    icon: 'laptop',
    defaultUnit: 'pcs',
  },
  {
    slug: 'home-kitchen',
    name: 'Home & Kitchen',
    color: '#14B8A6',
    icon: 'cooking-pot',
    defaultUnit: 'pcs',
  },
  { slug: 'furniture', name: 'Furniture', color: '#A16207', icon: 'armchair', defaultUnit: 'pcs' },
  {
    slug: 'groceries',
    name: 'Groceries',
    color: '#65A30D',
    icon: 'shopping-basket',
    defaultUnit: 'pcs',
  },
  {
    slug: 'fresh-produce',
    name: 'Fresh Produce',
    color: '#22C55E',
    icon: 'carrot',
    defaultUnit: 'kg',
  },
  {
    slug: 'meat-seafood',
    name: 'Meat & Seafood',
    color: '#DC2626',
    icon: 'beef',
    defaultUnit: 'kg',
  },
  { slug: 'bakery', name: 'Bakery', color: '#D97706', icon: 'croissant', defaultUnit: 'pcs' },
  { slug: 'dairy-eggs', name: 'Dairy & Eggs', color: '#FACC15', icon: 'egg', defaultUnit: 'pcs' },
  {
    slug: 'beverages',
    name: 'Beverages',
    color: '#0891B2',
    icon: 'cup-soda',
    defaultUnit: 'bottle',
  },
  {
    slug: 'snacks-confectionery',
    name: 'Snacks & Confectionery',
    color: '#E11D48',
    icon: 'candy',
    defaultUnit: 'pcs',
  },
  {
    slug: 'health-beauty',
    name: 'Health & Beauty',
    color: '#DB2777',
    icon: 'sparkles',
    defaultUnit: 'pcs',
  },
  { slug: 'baby-kids', name: 'Baby & Kids', color: '#F472B6', icon: 'baby', defaultUnit: 'pcs' },
  {
    slug: 'household-cleaning',
    name: 'Household & Cleaning',
    color: '#7C3AED',
    icon: 'spray-can',
    defaultUnit: 'pcs',
  },
  {
    slug: 'sports-outdoors',
    name: 'Sports & Outdoors',
    color: '#059669',
    icon: 'dumbbell',
    defaultUnit: 'pcs',
  },
  {
    slug: 'toys-games',
    name: 'Toys & Games',
    color: '#F59E0B',
    icon: 'gamepad-2',
    defaultUnit: 'pcs',
  },
  {
    slug: 'stationery-books',
    name: 'Stationery & Books',
    color: '#2563EB',
    icon: 'book-open',
    defaultUnit: 'pcs',
  },
]

type BrandDef = { slug: string; name: string; categories: string[]; models?: string[] }
const BRANDS: BrandDef[] = [
  {
    slug: 'samsung',
    name: 'Samsung',
    categories: ['electronics', 'mobile-phones'],
    models: ['Galaxy A15', 'Galaxy A05', 'Galaxy S23'],
  },
  {
    slug: 'apple',
    name: 'Apple',
    categories: ['mobile-phones', 'computers-office'],
    models: ['iPhone 13', 'iPhone 15', 'MacBook Air'],
  },
  { slug: 'tecno', name: 'Tecno', categories: ['mobile-phones'], models: ['Spark 20', 'Camon 20'] },
  { slug: 'itel', name: 'Itel', categories: ['mobile-phones'], models: ['A70', 'P55'] },
  {
    slug: 'infinix',
    name: 'Infinix',
    categories: ['mobile-phones'],
    models: ['Hot 40', 'Note 40'],
  },
  {
    slug: 'hp',
    name: 'HP',
    categories: ['computers-office'],
    models: ['Pavilion 15', 'EliteBook 840'],
  },
  {
    slug: 'dell',
    name: 'Dell',
    categories: ['computers-office'],
    models: ['Inspiron 15', 'Latitude 5440'],
  },
  { slug: 'lg', name: 'LG', categories: ['electronics'], models: ['UHD 43', 'NanoCell 55'] },
  { slug: 'sony', name: 'Sony', categories: ['electronics'] },
  { slug: 'hisense', name: 'Hisense', categories: ['electronics'], models: ['A4 43', 'U6 55'] },
  { slug: 'oraimo', name: 'Oraimo', categories: ['mobile-phones', 'electronics'] },
  { slug: 'anker', name: 'Anker', categories: ['mobile-phones', 'computers-office'] },
  { slug: 'nike', name: 'Nike', categories: ['fashion-apparel', 'footwear', 'sports-outdoors'] },
  {
    slug: 'adidas',
    name: 'Adidas',
    categories: ['fashion-apparel', 'footwear', 'sports-outdoors'],
  },
  { slug: 'puma', name: 'Puma', categories: ['fashion-apparel', 'footwear'] },
  {
    slug: 'waypoint',
    name: 'Waypoint',
    categories: ['fashion-apparel', 'footwear', 'home-kitchen'],
  },
  {
    slug: 'nestle',
    name: 'Nestlé',
    categories: ['groceries', 'dairy-eggs', 'beverages', 'baby-kids'],
  },
  { slug: 'coca-cola', name: 'Coca-Cola', categories: ['beverages'] },
  { slug: 'guinness', name: 'Guinness', categories: ['beverages'] },
  { slug: 'colgate', name: 'Colgate', categories: ['health-beauty'] },
  { slug: 'nivea', name: 'Nivea', categories: ['health-beauty'] },
  { slug: 'dettol', name: 'Dettol', categories: ['health-beauty', 'household-cleaning'] },
  { slug: 'omo', name: 'Omo', categories: ['household-cleaning'] },
  { slug: 'jumbo', name: 'Jumbo', categories: ['groceries'] },
  { slug: 'bic', name: 'Bic', categories: ['stationery-books'] },
]

// ─── Product spec DSL ───────────────────────────────────────────────────────
type VariantSpec = {
  options: Array<[group: string, value: string, colorHex?: string]>
  stock: number
  low?: number
  price?: number
  cost?: number
}
type ProductSpec = {
  name: string
  cat: string
  price: number
  cost: number
  unit?: string
  brand?: string
  featured?: boolean
  kind: 'SIMPLE' | 'VARIABLE' | 'SERIAL' | 'VARIANT'
  stock?: number
  low?: number
  serial?: { type: SerialType; count: number; warrantyMonths?: number }
  variants?: VariantSpec[]
}

const specs: ProductSpec[] = []
const simple = (
  cat: string,
  rows: Array<
    [
      name: string,
      price: number,
      cost: number,
      stock: number,
      low?: number,
      brand?: string,
      unit?: string,
    ]
  >,
) => {
  for (const [name, price, cost, stock, low, brand, unit] of rows) {
    specs.push({ name, cat, price, cost, stock, low: low ?? 5, brand, unit, kind: 'SIMPLE' })
  }
}
const variable = (
  cat: string,
  rows: Array<[name: string, pricePerKg: number, costPerKg: number, stockKg: number, low?: number]>,
) => {
  for (const [name, price, cost, stock, low] of rows) {
    specs.push({ name, cat, price, cost, stock, low: low ?? 5, unit: 'kg', kind: 'VARIABLE' })
  }
}
const serial = (
  cat: string,
  type: SerialType,
  rows: Array<
    [name: string, price: number, cost: number, count: number, brand?: string, warranty?: number]
  >,
) => {
  for (const [name, price, cost, count, brand, warranty] of rows) {
    specs.push({
      name,
      cat,
      price,
      cost,
      brand,
      kind: 'SERIAL',
      serial: { type, count, warrantyMonths: warranty ?? 12 },
    })
  }
}

const COLORS: Record<string, string> = {
  Black: '#111827',
  White: '#F9FAFB',
  Red: '#DC2626',
  Blue: '#2563EB',
  Navy: '#1E3A8A',
  Green: '#16A34A',
  Grey: '#6B7280',
  Beige: '#D6C7A1',
  Pink: '#EC4899',
  Yellow: '#FACC15',
}
function clothing(
  cat: string,
  name: string,
  price: number,
  cost: number,
  colors: string[],
  sizes: string[],
  brand?: string,
  stockPer = 8,
): void {
  const variants: VariantSpec[] = []
  for (const c of colors) {
    for (const s of sizes) {
      variants.push({
        options: [
          ['Color', c, COLORS[c]],
          ['Size', s],
        ],
        stock: randInt(Math.max(1, stockPer - 4), stockPer + 6),
      })
    }
  }
  specs.push({ name, cat, price, cost, brand, kind: 'VARIANT', variants })
}
function shoes(
  cat: string,
  name: string,
  price: number,
  cost: number,
  colors: string[],
  brand?: string,
): void {
  const sizes = ['40', '41', '42', '43', '44']
  const variants: VariantSpec[] = []
  for (const c of colors) {
    for (const s of sizes) {
      variants.push({
        options: [
          ['Color', c, COLORS[c]],
          ['Shoe Size', s],
        ],
        stock: randInt(2, 9),
      })
    }
  }
  specs.push({ name, cat, price, cost, brand, unit: 'pair', kind: 'VARIANT', variants })
}

// ── Fashion & Apparel ──
clothing(
  'fashion-apparel',
  'Classic Cotton T-Shirt',
  4500,
  2600,
  ['Black', 'White', 'Navy', 'Red'],
  ['S', 'M', 'L', 'XL'],
  'waypoint',
)
clothing(
  'fashion-apparel',
  'Polo Shirt',
  7500,
  4200,
  ['White', 'Navy', 'Green'],
  ['S', 'M', 'L', 'XL'],
  'nike',
)
clothing(
  'fashion-apparel',
  'Slim-Fit Jeans',
  12000,
  7000,
  ['Blue', 'Black', 'Grey'],
  ['S', 'M', 'L', 'XL'],
  'adidas',
)
clothing(
  'fashion-apparel',
  'Pullover Hoodie',
  15000,
  9000,
  ['Black', 'Grey', 'Navy'],
  ['M', 'L', 'XL'],
  'puma',
)
clothing(
  'fashion-apparel',
  'Summer Dress',
  11000,
  6000,
  ['Pink', 'Yellow', 'Beige'],
  ['S', 'M', 'L'],
)
simple('fashion-apparel', [
  ['Ankle Socks (3-pack)', 2500, 1300, 60, 15, 'nike', 'pack'],
  ["Men's Boxers (3-pack)", 4000, 2200, 45, 12, undefined, 'pack'],
  ['Baseball Cap', 3500, 1800, 40, 10, 'adidas'],
  ['Leather Belt', 6000, 3200, 30, 8, 'waypoint'],
  ['Winter Scarf', 4500, 2400, 25, 6],
  ['Cotton Bath Towel', 5500, 3000, 50, 12, 'waypoint'],
])

// ── Footwear ──
shoes('footwear', 'Running Sneakers', 22000, 14000, ['Black', 'White', 'Blue'], 'nike')
shoes('footwear', 'Canvas Trainers', 14000, 8500, ['White', 'Red', 'Navy'], 'puma')
simple('footwear', [
  ['Rubber Flip-Flops', 2000, 900, 80, 20, undefined, 'pair'],
  ['Leather Loafers', 26000, 16000, 18, 5, 'waypoint', 'pair'],
  ['Football Boots', 28000, 18000, 15, 4, 'adidas', 'pair'],
  ['Kids Sandals', 6500, 3400, 35, 8, undefined, 'pair'],
])

// ── Electronics ──
serial('electronics', SerialType.SERIAL_NUMBER, [
  ['Hisense 43" UHD Smart TV', 195000, 155000, 8, 'hisense', 24],
  ['LG 55" NanoCell Smart TV', 420000, 350000, 5, 'lg', 24],
  ['Samsung Split Air Conditioner 1.5HP', 285000, 235000, 6, 'samsung', 24],
  ['Hisense Double-Door Refrigerator', 245000, 198000, 7, 'hisense', 24],
])
simple('electronics', [
  ['Bluetooth Soundbar', 45000, 30000, 20, 5, 'sony'],
  ['Portable Bluetooth Speaker', 18000, 11000, 40, 10, 'oraimo'],
  ['Electric Steam Iron', 9500, 5500, 35, 8],
  ['Countertop Blender', 22000, 14000, 25, 6],
  ['Microwave Oven 20L', 68000, 52000, 12, 4],
  ['Electric Kettle 1.7L', 8500, 4800, 45, 12],
  ['Rice Cooker 1.8L', 16000, 10000, 28, 7],
  ['Standing Fan 16"', 19000, 12500, 30, 8],
  ['LED Desk Lamp', 7000, 3800, 40, 10],
  ['Extension Socket (4-way)', 4500, 2400, 60, 15],
])

// ── Mobile Phones & Accessories ──
serial('mobile-phones', SerialType.IMEI, [
  ['Samsung Galaxy A15 128GB', 145000, 118000, 10, 'samsung', 12],
  ['Tecno Spark 20 128GB', 98000, 78000, 14, 'tecno', 12],
  ['Itel A70 64GB', 62000, 48000, 18, 'itel', 12],
  ['Infinix Hot 40 256GB', 132000, 106000, 9, 'infinix', 12],
  ['Apple iPhone 13 128GB', 465000, 400000, 4, 'apple', 12],
])
simple('mobile-phones', [
  ['Oraimo 20000mAh Power Bank', 15000, 9000, 40, 10, 'oraimo'],
  ['USB-C Fast Charger 25W', 6500, 3500, 55, 15, 'anker'],
  ['USB-C to USB-C Cable 1m', 3000, 1400, 80, 20, 'oraimo'],
  ['Wireless Earbuds', 17000, 10500, 35, 8, 'oraimo'],
  ['Silicone Phone Case', 2500, 1000, 90, 25],
  ['Tempered Glass Screen Protector', 2000, 800, 100, 30],
  ['64GB microSD Card', 7500, 4200, 45, 12, 'samsung'],
])

// ── Computers & Office ──
serial('computers-office', SerialType.SERIAL_NUMBER, [
  ['HP Pavilion 15 Core i5 Laptop', 585000, 495000, 6, 'hp', 12],
  ['Dell Inspiron 15 Core i3 Laptop', 445000, 375000, 7, 'dell', 12],
  ['HP DeskJet Ink Printer', 78000, 60000, 10, 'hp', 12],
])
simple('computers-office', [
  ['Wireless Mouse', 5500, 2800, 60, 15, 'hp'],
  ['USB Keyboard', 7000, 3800, 45, 12, 'dell'],
  ['64GB USB Flash Drive', 6000, 3200, 70, 18, 'samsung'],
  ['1TB External Hard Drive', 42000, 32000, 20, 5, 'anker'],
  ['Dual-Band Wi-Fi Router', 28000, 19000, 18, 5],
  ['1080p Webcam', 16000, 10000, 22, 6],
  ['Laptop Backpack', 14000, 8000, 30, 8, 'waypoint'],
  ['A4 Printer Paper (ream)', 4500, 2900, 120, 30, undefined, 'pack'],
])

// ── Home & Kitchen ──
simple('home-kitchen', [
  ['Non-Stick Frying Pan 28cm', 9500, 5500, 35, 8, 'waypoint'],
  ['Stainless Cooking Pot Set (3pc)', 28000, 18000, 20, 5, 'waypoint', 'box'],
  ['Dinner Plate Set (6pc)', 12000, 7000, 25, 6, undefined, 'box'],
  ['Cutlery Set (24pc)', 15000, 9000, 22, 6, undefined, 'box'],
  ['Drinking Glass Set (6pc)', 6500, 3500, 40, 10, undefined, 'box'],
  ['Insulated Water Bottle 1L', 5000, 2600, 55, 14],
  ['Food Container Set (5pc)', 7500, 4000, 45, 12, undefined, 'box'],
  ['Bamboo Chopping Board', 4000, 2000, 50, 12],
  ['Kitchen Knife Set (5pc)', 13000, 8000, 18, 5, undefined, 'box'],
  ['Vacuum Flask 1.5L', 8000, 4500, 30, 8],
])

// ── Furniture ──
simple('furniture', [
  ['Plastic Stackable Chair', 6500, 3800, 60, 15],
  ['Ergonomic Office Chair', 68000, 48000, 12, 4],
  ['Study Desk', 55000, 38000, 10, 3],
  ['5-Tier Shoe Rack', 14000, 8500, 20, 5],
  ['2-Door Wardrobe', 125000, 92000, 6, 2],
  ['Foam Mattress (Queen)', 95000, 68000, 8, 3, 'waypoint'],
  ['Metal Bed Frame (Queen)', 78000, 55000, 7, 2],
])

// ── Groceries ──
simple('groceries', [
  ['Basmati Rice 5kg', 6500, 5200, 80, 20, 'jumbo', 'pack'],
  ['Parboiled Rice 25kg', 22000, 18500, 40, 10, 'jumbo', 'pack'],
  ['Vegetable Oil 5L', 8500, 6800, 60, 15, undefined, 'bottle'],
  ['Vegetable Oil 1L', 1900, 1450, 120, 30, undefined, 'bottle'],
  ['Spaghetti 500g', 700, 480, 200, 40, undefined, 'pack'],
  ['Tomato Paste 400g', 850, 560, 150, 35],
  ['Granulated Sugar 1kg', 1200, 900, 130, 30, undefined, 'pack'],
  ['Table Salt 1kg', 500, 300, 160, 40, undefined, 'pack'],
  ['Wheat Flour 1kg', 1100, 820, 110, 28, undefined, 'pack'],
  ['Maize Flour 1kg', 900, 650, 100, 25, undefined, 'pack'],
  ['Dry Beans 1kg', 1600, 1200, 90, 22, undefined, 'pack'],
  ['Groundnuts 1kg', 1800, 1300, 70, 18, undefined, 'pack'],
  ['Palm Oil 1L', 2200, 1700, 85, 20, undefined, 'bottle'],
  ['Maggi Seasoning Cubes (100)', 1500, 1100, 140, 35, 'nestle', 'box'],
  ['Curry Powder 100g', 700, 420, 120, 30],
  ['Garri 5kg', 4500, 3400, 50, 12, undefined, 'pack'],
  ['Couscous 1kg', 2000, 1500, 60, 15, undefined, 'pack'],
  ['Canned Sardines 125g', 950, 640, 130, 32],
  ['Peanut Butter 500g', 2400, 1600, 55, 14],
  ['Honey 500g', 4500, 3100, 40, 10, undefined, 'bottle'],
])

// ── Fresh Produce (sold by kg) ──
variable('fresh-produce', [
  ['Fresh Tomatoes', 900, 600, 45, 10],
  ['Onions', 800, 520, 60, 12],
  ['Irish Potatoes', 1000, 680, 55, 12],
  ['Ripe Plantain', 700, 450, 50, 10],
  ['Carrots', 1100, 720, 30, 8],
  ['Green Pepper', 1400, 950, 20, 5],
  ['Fresh Garlic', 3500, 2400, 15, 4],
  ['Fresh Ginger', 2800, 1900, 18, 5],
  ['Apples', 2500, 1700, 35, 8],
  ['Bananas', 800, 500, 45, 10],
  ['Oranges', 1200, 780, 40, 10],
  ['Pineapple', 900, 560, 30, 8],
  ['Watermelon', 600, 380, 60, 12],
  ['White Cabbage', 700, 430, 35, 8],
  ['Fresh Lettuce', 1300, 850, 20, 5],
])

// ── Meat & Seafood (sold by kg) ──
variable('meat-seafood', [
  ['Fresh Beef', 3500, 2800, 40, 8],
  ['Whole Chicken', 2800, 2200, 35, 8],
  ['Chicken Wings', 3200, 2500, 25, 6],
  ['Goat Meat', 4200, 3400, 20, 5],
  ['Pork', 3000, 2400, 22, 5],
  ['Fresh Mackerel', 2600, 1900, 30, 7],
  ['Frozen Fish', 2200, 1600, 45, 10],
  ['Shrimp', 6500, 5200, 12, 3],
  ['Beef Sausages', 3800, 2900, 18, 5],
  ['Turkey Tail', 3400, 2700, 20, 5],
])

// ── Bakery ──
simple('bakery', [
  ['Sliced Sandwich Bread', 1200, 800, 60, 15],
  ['French Baguette', 500, 300, 90, 20],
  ['Butter Croissant', 400, 220, 70, 18],
  ['Glazed Doughnut', 350, 180, 80, 20],
  ['Chocolate Cake Slice', 1500, 900, 30, 8],
  ['Beef Meat Pie', 800, 500, 50, 12],
  ['Puff-Puff (10-pack)', 1000, 550, 40, 10, undefined, 'pack'],
  ['Assorted Cookies 250g', 1800, 1100, 45, 12, undefined, 'pack'],
])

// ── Dairy & Eggs ──
simple('dairy-eggs', [
  ['Fresh Milk 1L', 1500, 1050, 70, 18, 'nestle', 'bottle'],
  ['Powdered Milk 400g', 3200, 2400, 60, 15, 'nestle', 'box'],
  ['Strawberry Yogurt 500g', 1800, 1200, 55, 14],
  ['Cheddar Cheese 200g', 3500, 2500, 30, 8],
  ['Butter 250g', 2200, 1500, 40, 10],
  ['Crate of Eggs (30)', 3600, 2900, 50, 12, undefined, 'crate'],
  ['Dozen Eggs', 1600, 1250, 80, 20, undefined, 'dozen'],
  ['Margarine 500g', 1900, 1300, 45, 12],
])

// ── Beverages ──
simple('beverages', [
  ['Coca-Cola 50cl', 500, 350, 240, 48, 'coca-cola', 'bottle'],
  ['Coca-Cola 1.5L', 1200, 850, 120, 30, 'coca-cola', 'bottle'],
  ['Fanta Orange 50cl', 500, 350, 200, 40, 'coca-cola', 'bottle'],
  ['Sprite 50cl', 500, 350, 180, 40, 'coca-cola', 'bottle'],
  ['Bottled Water 1.5L', 400, 220, 300, 60, undefined, 'bottle'],
  ['Bottled Water 50cl', 250, 130, 400, 80, undefined, 'bottle'],
  ['Orange Juice 1L', 1800, 1200, 70, 18, undefined, 'bottle'],
  ['Malta Guinness 33cl', 700, 480, 150, 35, 'guinness', 'bottle'],
  ['Energy Drink 25cl', 900, 560, 120, 30, undefined, 'bottle'],
  ['33 Export Beer 65cl', 1000, 700, 160, 40, undefined, 'bottle'],
  ['Guinness Stout 33cl', 1100, 780, 130, 32, 'guinness', 'bottle'],
  ['Castel Beer 65cl', 950, 660, 140, 35, undefined, 'bottle'],
  ['Red Wine 75cl', 6500, 4500, 40, 10, undefined, 'bottle'],
  ['Whisky 70cl', 12000, 8500, 25, 6, undefined, 'bottle'],
  ['Green Tea Bags (25)', 1500, 950, 60, 15, undefined, 'box'],
  ['Nescafé Classic 100g', 3200, 2300, 70, 18, 'nestle', 'box'],
  ['Milo 500g', 3000, 2200, 65, 16, 'nestle', 'box'],
  ['Soft Drink Crate (12)', 5500, 4200, 40, 10, 'coca-cola', 'crate'],
])

// ── Snacks & Confectionery ──
simple('snacks-confectionery', [
  ['Digestive Biscuits 250g', 1200, 750, 90, 22, undefined, 'pack'],
  ['Milk Chocolate Bar 100g', 1500, 950, 80, 20],
  ['Potato Crisps 150g', 1000, 600, 100, 25, undefined, 'pack'],
  ['Assorted Candy 200g', 1300, 800, 70, 18, undefined, 'pack'],
  ['Chewing Gum (box)', 1800, 1100, 50, 12, undefined, 'box'],
  ['Microwave Popcorn (3-pack)', 1600, 1000, 55, 14, undefined, 'pack'],
  ['Roasted Groundnuts 200g', 900, 520, 85, 20, undefined, 'pack'],
  ['Plantain Chips 150g', 800, 450, 95, 22, undefined, 'pack'],
  ['Wafer Rolls 120g', 700, 400, 90, 22, undefined, 'pack'],
  ['Lollipop Assortment (24)', 1200, 700, 60, 15, undefined, 'pack'],
])

// ── Health & Beauty ──
simple('health-beauty', [
  ['Toothpaste 100ml', 1400, 900, 110, 28, 'colgate'],
  ['Toothbrush (twin-pack)', 1200, 700, 90, 22, 'colgate', 'pack'],
  ['Bar Soap 175g', 600, 350, 150, 35, 'dettol'],
  ['Shower Gel 250ml', 2500, 1600, 70, 18, 'nivea', 'bottle'],
  ['Shampoo 400ml', 3000, 1900, 60, 15, undefined, 'bottle'],
  ['Body Lotion 400ml', 2800, 1800, 65, 16, 'nivea', 'bottle'],
  ['Roll-On Deodorant', 1800, 1100, 80, 20],
  ["Men's Perfume 100ml", 12000, 8000, 25, 6],
  ['Hand Sanitizer 250ml', 1500, 900, 90, 22, 'dettol', 'bottle'],
  ['Disposable Razor (5-pack)', 1600, 950, 70, 18, undefined, 'pack'],
  ['Sanitary Pads (pack of 10)', 1400, 850, 100, 25, undefined, 'pack'],
  ['Cotton Wool 100g', 900, 500, 80, 20, undefined, 'pack'],
  ['Petroleum Jelly 250ml', 1300, 800, 75, 18],
])

// ── Baby & Kids ──
clothing(
  'baby-kids',
  'Baby Diapers Jumbo Pack',
  6500,
  4500,
  ['White'],
  ['Small', 'Medium', 'Large', 'XL'],
  'nestle',
  25,
)
simple('baby-kids', [
  ['Baby Wipes (72-pack)', 1800, 1100, 90, 22, undefined, 'pack'],
  ['Infant Formula 400g', 5500, 4200, 50, 12, 'nestle', 'box'],
  ['Baby Food Jar 130g', 1200, 750, 80, 20],
  ['Feeding Bottle 250ml', 2500, 1500, 45, 12, undefined, 'bottle'],
  ['Baby Soap 100g', 800, 450, 100, 25],
  ['Baby Lotion 200ml', 2200, 1400, 55, 14, 'nivea', 'bottle'],
])

// ── Household & Cleaning ──
simple('household-cleaning', [
  ['Detergent Powder 1kg', 2500, 1700, 100, 25, 'omo', 'pack'],
  ['Liquid Hand Soap 500ml', 1600, 950, 80, 20, 'dettol', 'bottle'],
  ['Bleach 1L', 900, 550, 110, 28, undefined, 'bottle'],
  ['Dishwashing Liquid 750ml', 1400, 850, 90, 22, undefined, 'bottle'],
  ['Toilet Paper (12-roll)', 3500, 2400, 70, 18, undefined, 'pack'],
  ['Air Freshener Spray', 2200, 1400, 60, 15],
  ['Insecticide Spray 400ml', 2800, 1900, 55, 14],
  ['Sweeping Broom', 1500, 800, 50, 12],
  ['Floor Mop with Handle', 3200, 2000, 40, 10],
  ['Plastic Bucket 15L', 2500, 1500, 45, 12],
  ['Scouring Sponge (5-pack)', 900, 500, 90, 22, undefined, 'pack'],
  ['Multi-Surface Floor Cleaner 1L', 2000, 1300, 65, 16, undefined, 'bottle'],
])

// ── Sports & Outdoors ──
simple('sports-outdoors', [
  ['Size-5 Football', 8500, 5200, 35, 8, 'adidas'],
  ['Yoga Mat', 9000, 5500, 25, 6],
  ['Adjustable Dumbbell Set 20kg', 45000, 32000, 12, 3, undefined, 'box'],
  ['Skipping Rope', 3000, 1600, 50, 12, 'nike'],
  ['Sports Water Bottle 750ml', 4500, 2600, 45, 12],
  ['Tennis Racket', 22000, 14000, 15, 4],
  ['Resistance Band Set', 6500, 3800, 30, 8, undefined, 'pack'],
])

// ── Toys & Games ──
simple('toys-games', [
  ['Remote Control Car', 12000, 7500, 25, 6],
  ['Fashion Doll', 6500, 3800, 40, 10],
  ['Building Blocks (120pc)', 9000, 5500, 30, 8, undefined, 'box'],
  ['Family Board Game', 8000, 4800, 22, 6, undefined, 'box'],
  ['500-Piece Jigsaw Puzzle', 5500, 3200, 28, 7, undefined, 'box'],
  ['Plush Teddy Bear', 7000, 4000, 35, 8],
  ['Water Blaster Gun', 4500, 2400, 45, 12],
])

// ── Stationery & Books ──
simple('stationery-books', [
  ['A4 Exercise Book (200pg)', 700, 420, 200, 50],
  ['Ballpoint Pens (10-pack)', 1500, 850, 120, 30, 'bic', 'pack'],
  ['HB Pencils (12-pack)', 1200, 700, 100, 25, undefined, 'pack'],
  ['Eraser (3-pack)', 500, 250, 130, 32, undefined, 'pack'],
  ['30cm Ruler', 400, 200, 110, 28],
  ['Spiral Notebook A5', 900, 500, 90, 22],
  ['School Backpack', 12000, 7000, 30, 8, 'waypoint'],
  ['Scientific Calculator', 8500, 5200, 25, 6],
  ['Sticky Notes (5-pack)', 1600, 950, 70, 18, undefined, 'pack'],
  ['Permanent Marker Set (4)', 2200, 1300, 60, 15, undefined, 'pack'],
])

// ─── Contacts, expense categories ───────────────────────────────────────────
type ContactDef = { name: string; type: ContactType; phone: string; email?: string; city?: string }
const CONTACTS: ContactDef[] = [
  {
    name: 'Aïcha Ngono',
    type: ContactType.CUSTOMER,
    phone: '+237671111001',
    email: 'aicha.ngono@example.cm',
    city: 'Douala',
  },
  { name: 'Emmanuel Fotso', type: ContactType.CUSTOMER, phone: '+237671111002', city: 'Douala' },
  {
    name: 'Brenda Achu',
    type: ContactType.CUSTOMER,
    phone: '+237671111003',
    email: 'brenda.achu@example.cm',
    city: 'Yaoundé',
  },
  { name: 'Serge Mbarga', type: ContactType.CUSTOMER, phone: '+237671111004', city: 'Douala' },
  { name: 'Divine Enow', type: ContactType.CUSTOMER, phone: '+237671111005', city: 'Buea' },
  { name: 'Patrick Kamdem', type: ContactType.CUSTOMER, phone: '+237671111006', city: 'Bafoussam' },
  {
    name: 'Lydia Ndzana',
    type: ContactType.CUSTOMER,
    phone: '+237671111007',
    email: 'lydia.n@example.cm',
    city: 'Yaoundé',
  },
  {
    name: 'Restaurant Le Palais',
    type: ContactType.CUSTOMER,
    phone: '+237671111008',
    email: 'contact@lepalais.cm',
    city: 'Douala',
  },
  {
    name: 'Hotel Sawa Catering',
    type: ContactType.CUSTOMER,
    phone: '+237671111009',
    city: 'Douala',
  },
  {
    name: 'CFAO Distribution',
    type: ContactType.SUPPLIER,
    phone: '+237672222001',
    email: 'sales@cfao.cm',
    city: 'Douala',
  },
  {
    name: 'Brasseries du Cameroun',
    type: ContactType.SUPPLIER,
    phone: '+237672222002',
    email: 'orders@brasseries.cm',
    city: 'Douala',
  },
  { name: 'Fokou Wholesale', type: ContactType.SUPPLIER, phone: '+237672222003', city: 'Douala' },
  {
    name: 'Congelcam Frozen Foods',
    type: ContactType.SUPPLIER,
    phone: '+237672222004',
    email: 'supply@congelcam.cm',
    city: 'Douala',
  },
  {
    name: 'Mahima Superstores',
    type: ContactType.SUPPLIER,
    phone: '+237672222005',
    city: 'Douala',
  },
  {
    name: 'TechHub Imports',
    type: ContactType.BOTH,
    phone: '+237672222006',
    email: 'hello@techhub.cm',
    city: 'Douala',
  },
]

type ExpenseCatDef = { name: string; color: string; icon: string }
const EXPENSE_CATEGORIES: ExpenseCatDef[] = [
  { name: 'Rent', color: '#7C3AED', icon: 'building' },
  { name: 'Utilities', color: '#0EA5E9', icon: 'zap' },
  { name: 'Salaries', color: '#16A34A', icon: 'users' },
  { name: 'Transport & Logistics', color: '#F97316', icon: 'truck' },
  { name: 'Supplies & Restocking', color: '#DC2626', icon: 'package' },
  { name: 'Marketing', color: '#EC4899', icon: 'megaphone' },
  { name: 'Maintenance', color: '#A16207', icon: 'wrench' },
  { name: 'Miscellaneous', color: '#6B7280', icon: 'ellipsis' },
]

// ─── Seed runner ────────────────────────────────────────────────────────────
async function wipeBusiness(manager: EntityManager, businessId: string): Promise<void> {
  // Delete children first (explicit order beats relying on cascade FK actions).
  const tables = [
    'sale_payments',
    'sale_items',
    'sales',
    'inventory_movements',
    'product_serial_units',
    'inventory_levels',
    'product_variant_options',
    'product_images',
    'product_variants',
    'products',
    'debts',
    'contacts',
    'expenses',
    'expense_categories',
    'brand_categories',
    'models',
    'brands',
    'attribute_options',
    'attribute_groups',
    'product_categories',
    'business_members',
  ]
  for (const table of tables) {
    await manager.query(`DELETE FROM ${table} WHERE business_id = $1`, [businessId])
  }
  await manager.query('DELETE FROM unit_of_measures WHERE business_id = $1', [businessId])
  await manager.query('DELETE FROM businesses WHERE id = $1', [businessId])
}

async function seed(): Promise<void> {
  const ds = AppDataSource
  await ds.initialize()
  console.log(`\n🌱 Seeding demo store "${BUSINESS_NAME}" …`)

  try {
    // Everything runs in ONE transaction — any failure rolls the whole seed back,
    // so the database is never left with a half-built demo store.
    const summary = await ds.transaction(async (manager) => {
      // Reset any previous run of this demo business (never touches other businesses).
      const existing = await manager
        .getRepository(Business)
        .findOne({ where: { slug: BUSINESS_SLUG } })
      if (existing) {
        console.log('   ↺ Existing demo business found — wiping it for a clean rebuild.')
        await wipeBusiness(manager, existing.id)
      }

      console.log('   ↺ Creating demo business and owner user …')

      // ── Owner user (upsert by email) ──
      const usersRepo = manager.getRepository(User)
      const passwordHash = await bcrypt.hash(OWNER_PASSWORD, 12)
      let owner = await usersRepo.findOne({ where: { email: OWNER_EMAIL } })
      if (!owner) {
        owner = usersRepo.create({
          name: 'Waypoint Admin',
          email: OWNER_EMAIL,
          phone: OWNER_PHONE,
          passwordHash,
          role: UserRole.OWNER,
          language: Locale.EN,
          isEmailVerified: true,
          isPhoneVerified: true,
          status: UserStatus.ACTIVE,
        })
        owner = await usersRepo.save(owner)
      } else {
        owner.passwordHash = passwordHash
        owner.status = UserStatus.ACTIVE
        owner = await usersRepo.save(owner)
      }

      // ── Business (PRO, active) ──
      const now = new Date()
      const periodEnd = new Date(now)
      periodEnd.setMonth(periodEnd.getMonth() + 1)
      const business = await manager.getRepository(Business).save(
        manager.getRepository(Business).create({
          name: BUSINESS_NAME,
          slug: BUSINESS_SLUG,
          description: 'Everything under one roof — fashion, electronics, groceries and more.',
          phone: '+237233470000',
          email: 'shop@waypoint.cm',
          address: 'Boulevard de la Liberté, Akwa',
          city: 'Douala',
          country: 'CM',
          currency: 'XAF',
          type: BusinessType.AUTRE,
          ownerId: owner.id,
          plan: SubscriptionPlan.PRO,
          subscriptionStatus: SubscriptionStatus.ACTIVE,
          businessStatus: BusinessStatus.ACTIVE,
          billingCycle: BillingCycle.MONTHLY,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        }),
      )
      const businessId = business.id

      await manager.getRepository(BusinessMember).save(
        manager.getRepository(BusinessMember).create({
          businessId,
          userId: owner.id,
          role: BusinessMemberRole.OWNER,
          status: BusinessMemberStatus.ACTIVE,
        }),
      )

      // ── Units of measure ──
      const unitId = new Map<string, string>()
      const unitAbbr = new Map<string, string>()
      const unitsRepo = manager.getRepository(UnitOfMeasure)
      // Global "Piece" (businessId null) — reuse if present.
      const piece =
        (await unitsRepo.findOne({ where: { businessId: IsNull(), name: 'PIECE' } })) ??
        (await unitsRepo.save(
          unitsRepo.create({
            name: 'Piece',
            abbreviation: 'pcs',
            type: UnitOfMeasureType.QUANTITY,
            isDefault: true,
          }),
        ))
      unitId.set('pcs', piece.id)
      unitAbbr.set('pcs', piece.abbreviation)
      for (const u of UNIT_DEFS) {
        const row = await unitsRepo.save(
          unitsRepo.create({ businessId, name: u.name, abbreviation: u.abbr, type: u.type }),
        )
        unitId.set(u.key, row.id)
        unitAbbr.set(u.key, u.abbr)
      }

      // ── Categories ──
      const catId = new Map<string, string>()
      const catCode = new Map<string, string>()
      const catRepo = manager.getRepository(ProductCategory)
      let catSort = 0
      for (const c of CATEGORIES) {
        const row = await catRepo.save(
          catRepo.create({
            businessId,
            name: c.name,
            slug: c.slug,
            color: c.color,
            icon: c.icon,
            sortOrder: catSort++,
            defaultUnitOfMeasureId: unitId.get(c.defaultUnit) ?? null,
            depth: 1,
          }),
        )
        catId.set(c.slug, row.id)
        catCode.set(c.slug, c.slug.slice(0, 3).toUpperCase())
      }

      // ── Attribute groups + options (created on demand from variant specs) ──
      const groupId = new Map<string, string>()
      const optionId = new Map<string, string>() // key: `${group}::${value}`
      const groupsRepo = manager.getRepository(AttributeGroup)
      const optionsRepo = manager.getRepository(AttributeOption)
      let groupSort = 0
      async function ensureGroup(name: string): Promise<string> {
        if (groupId.has(name)) return groupId.get(name) as string
        const display =
          name === 'Color' ? AttributeDisplayType.SWATCHES : AttributeDisplayType.CHIPS
        const row = await groupsRepo.save(
          groupsRepo.create({ businessId, name, displayType: display, sortOrder: groupSort++ }),
        )
        groupId.set(name, row.id)
        return row.id
      }
      const optionSort = new Map<string, number>()
      async function ensureOption(
        group: string,
        value: string,
        colorHex?: string,
      ): Promise<string> {
        const key = `${group}::${value}`
        if (optionId.has(key)) return optionId.get(key) as string
        const gid = await ensureGroup(group)
        const sort = optionSort.get(group) ?? 0
        optionSort.set(group, sort + 1)
        const row = await optionsRepo.save(
          optionsRepo.create({
            businessId,
            groupId: gid,
            value,
            colorHex: colorHex ?? null,
            sortOrder: sort,
          }),
        )
        optionId.set(key, row.id)
        return row.id
      }

      // ── Brands + models + brand-category links ──
      const brandId = new Map<string, string>()
      const brandsRepo = manager.getRepository(Brand)
      const modelsRepo = manager.getRepository(Model)
      const brandCatRepo = manager.getRepository(BrandCategory)
      let brandSort = 0
      for (const b of BRANDS) {
        const brand = await brandsRepo.save(
          brandsRepo.create({ businessId, name: b.name, slug: b.slug, sortOrder: brandSort++ }),
        )
        brandId.set(b.slug, brand.id)
        for (const cat of b.categories) {
          const cid = catId.get(cat)
          if (cid)
            await brandCatRepo.save(
              brandCatRepo.create({ businessId, brandId: brand.id, categoryId: cid }),
            )
        }
        let modelSort = 0
        for (const m of b.models ?? []) {
          await modelsRepo.save(
            modelsRepo.create({
              businessId,
              brandId: brand.id,
              name: m,
              slug: slugify(`${b.slug}-${m}`),
              sortOrder: modelSort++,
            }),
          )
        }
      }

      // ── Products (+ inventory, variants, serial units) ──
      const productsRepo = manager.getRepository(Product)
      const variantsRepo = manager.getRepository(ProductVariant)
      const variantOptsRepo = manager.getRepository(ProductVariantOption)
      const serialRepo = manager.getRepository(ProductSerialUnit)
      const levelsRepo = manager.getRepository(InventoryLevel)
      const movementsRepo = manager.getRepository(InventoryMovement)

      // Sellable lines used later for sales generation.
      type Level = { id: string; qty: number }
      type Sellable = {
        productId: string
        productName: string
        productSku: string | null
        unit: string
        variantId: string | null
        variantName: string | null
        price: number
        cost: number
        level: Level
      }
      const sellables: Sellable[] = []
      const openingMovements: InventoryMovement[] = []

      let productCount = 0
      let variantCount = 0
      let serialCount = 0

      for (const s of specs) {
        const unitKey = s.unit ?? CATEGORIES.find((c) => c.slug === s.cat)?.defaultUnit ?? 'pcs'
        const isVariable = s.kind === 'VARIABLE'
        const productType = isVariable ? ProductType.VARIABLE_QUANTITY : ProductType.SIMPLE
        const code = catCode.get(s.cat) ?? 'GEN'
        const sku = nextSku(code)
        const product = await productsRepo.save(
          productsRepo.create({
            businessId,
            name: s.name,
            slug: slugify(s.name),
            sku,
            barcode: nextBarcode(),
            barcodeType: 'EAN13',
            sellingPrice: s.price,
            costPrice: s.cost,
            currency: 'XAF',
            taxRate: 0,
            productType,
            hasVariants: s.kind === 'VARIANT',
            isSerialized: s.kind === 'SERIAL',
            serialType: s.kind === 'SERIAL' ? s.serial?.type : null,
            warrantyMonths: s.kind === 'SERIAL' ? (s.serial?.warrantyMonths ?? 12) : null,
            categoryId: catId.get(s.cat) ?? null,
            brandId: s.brand ? (brandId.get(s.brand) ?? null) : null,
            unitOfMeasureId: unitId.get(unitKey) as string,
            isFeatured: !!s.featured,
            createdById: owner.id,
          }),
        )
        productCount++
        const unitAbbrVal = unitAbbr.get(unitKey) ?? 'pcs'

        if (s.kind === 'VARIANT' && s.variants) {
          let vSort = 0
          for (const v of s.variants) {
            const suffix = v.options.map((o) => o[1]).join(' / ')
            const variant = await variantsRepo.save(
              variantsRepo.create({
                businessId,
                productId: product.id,
                name: `${s.name} · ${suffix}`,
                sku: `${sku}-V${vSort + 1}`,
                barcode: nextBarcode(),
                priceOverride: v.price ?? null,
                costPriceOverride: v.cost ?? null,
                sortOrder: vSort++,
              }),
            )
            variantCount++
            for (const [group, value, hex] of v.options) {
              const oid = await ensureOption(group, value, hex)
              await variantOptsRepo.save(
                variantOptsRepo.create({
                  businessId,
                  variantId: variant.id,
                  attributeGroupId: groupId.get(group) as string,
                  attributeOptionId: oid,
                }),
              )
            }
            const level = await levelsRepo.save(
              levelsRepo.create({
                businessId,
                productId: product.id,
                variantId: variant.id,
                quantity: v.stock,
                lowStockThreshold: v.low ?? 4,
              }),
            )
            openingMovements.push(
              movementsRepo.create({
                businessId,
                productId: product.id,
                variantId: variant.id,
                type: MovementType.OPENING_STOCK,
                quantityChange: v.stock,
                quantityBefore: 0,
                quantityAfter: v.stock,
                notes: 'Opening stock',
                performedById: owner.id,
              }),
            )
            sellables.push({
              productId: product.id,
              productName: s.name,
              productSku: sku,
              unit: unitAbbrVal,
              variantId: variant.id,
              variantName: variant.name,
              price: v.price ?? s.price,
              cost: v.cost ?? s.cost,
              level: { id: level.id, qty: v.stock },
            })
          }
        } else if (s.kind === 'SERIAL' && s.serial) {
          for (let i = 0; i < s.serial.count; i++) {
            await serialRepo.save(
              serialRepo.create({
                businessId,
                productId: product.id,
                serialNumber: nextSerial(s.serial.type),
                serialType: s.serial.type,
                status: SerialUnitStatus.IN_STOCK,
                purchasePrice: s.cost,
              }),
            )
            serialCount++
          }
          // Serialized stock is derived from IN_STOCK units — no inventory_levels row.
        } else {
          const stock = s.stock ?? 0
          const level = await levelsRepo.save(
            levelsRepo.create({
              businessId,
              productId: product.id,
              quantity: stock,
              lowStockThreshold: s.low ?? 5,
              reorderPoint: s.low ?? 5,
            }),
          )
          openingMovements.push(
            movementsRepo.create({
              businessId,
              productId: product.id,
              type: MovementType.OPENING_STOCK,
              quantityChange: stock,
              quantityBefore: 0,
              quantityAfter: stock,
              notes: 'Opening stock',
              performedById: owner.id,
            }),
          )
          sellables.push({
            productId: product.id,
            productName: s.name,
            productSku: sku,
            unit: unitAbbrVal,
            variantId: null,
            variantName: null,
            price: s.price,
            cost: s.cost,
            level: { id: level.id, qty: stock },
          })
        }
      }
      await movementsRepo.save(openingMovements)

      // ── Contacts ──
      const contactsRepo = manager.getRepository(Contact)
      const customers: Contact[] = []
      for (const c of CONTACTS) {
        const contact = await contactsRepo.save(
          contactsRepo.create({
            businessId,
            type: c.type,
            name: c.name,
            phone: c.phone,
            email: c.email ?? null,
            address: c.city ? `${c.city}, Cameroon` : null,
            createdById: owner.id,
          }),
        )
        if (c.type === ContactType.CUSTOMER || c.type === ContactType.BOTH) customers.push(contact)
      }
      const suppliers = await contactsRepo.find({
        where: { businessId, type: ContactType.SUPPLIER },
      })

      // ── Expense categories + expenses ──
      const expCatRepo = manager.getRepository(ExpenseCategory)
      const expRepo = manager.getRepository(Expense)
      const expenseCats: ExpenseCategory[] = []
      let ecSort = 0
      for (const ec of EXPENSE_CATEGORIES) {
        expenseCats.push(
          await expCatRepo.save(
            expCatRepo.create({
              businessId,
              name: ec.name,
              slug: slugify(`exp-${ec.name}`),
              color: ec.color,
              icon: ec.icon,
              sortOrder: ecSort++,
            }),
          ),
        )
      }
      const byCat = (name: string) => expenseCats.find((c) => c.name === name) as ExpenseCategory
      const expenseSeeds: Array<[cat: string, desc: string, amount: number, vendor?: string]> = [
        ['Rent', 'Monthly store rent — Akwa branch', 450000, 'Akwa Properties Ltd'],
        ['Utilities', 'ENEO electricity bill', 185000, 'ENEO Cameroon'],
        ['Utilities', 'Camwater water bill', 42000, 'Camwater'],
        ['Utilities', 'Internet & data subscription', 55000, 'Camtel'],
        ['Salaries', 'Staff salaries — cashiers & floor', 1250000],
        ['Transport & Logistics', 'Delivery van fuel', 90000, 'TotalEnergies'],
        ['Transport & Logistics', 'Goods transport from port', 120000, 'Fokou Logistics'],
        ['Supplies & Restocking', 'Beverage restock', 480000, 'Brasseries du Cameroun'],
        ['Supplies & Restocking', 'Grocery restock', 650000, 'CFAO Distribution'],
        ['Supplies & Restocking', 'Frozen foods restock', 380000, 'Congelcam Frozen Foods'],
        ['Marketing', 'Radio advert campaign', 150000, 'Sweet FM'],
        ['Marketing', 'Social media promotion', 75000],
        ['Maintenance', 'Cold-room servicing', 95000],
        ['Maintenance', 'POS terminal repair', 30000],
        ['Miscellaneous', 'Office & cleaning supplies', 40000],
      ]
      const expenses: Expense[] = []
      for (const [cat, desc, amount, vendor] of expenseSeeds) {
        expenses.push(
          expRepo.create({
            businessId,
            recordedById: owner.id,
            categoryId: byCat(cat).id,
            description: desc,
            amount,
            currency: 'XAF',
            paymentMethod: pick([
              PaymentMethod.CASH,
              PaymentMethod.MTN_MOMO,
              PaymentMethod.ORANGE_MONEY,
            ]),
            vendor: vendor ?? null,
            status: 'PAID',
            date: dateNDaysAgo(randInt(1, 55)),
          }),
        )
      }
      await expRepo.save(expenses)

      // ── Sales over the last 45 days (+ payments, movements, stock decrement) ──
      const salesRepo = manager.getRepository(Sale)
      const saleItemsRepo = manager.getRepository(SaleItem)
      const salePaymentsRepo = manager.getRepository(SalePayment)
      const debtsRepo = manager.getRepository(Debt)

      const paymentMix: PaymentMethod[] = [
        ...Array(11).fill(PaymentMethod.CASH),
        ...Array(5).fill(PaymentMethod.MTN_MOMO),
        ...Array(3).fill(PaymentMethod.ORANGE_MONEY),
        PaymentMethod.CARD,
      ]
      const inStock = () => sellables.filter((x) => x.level.qty > 0)
      const saleMovements: InventoryMovement[] = []
      let saleSeq = 0
      let creditDebts = 0

      for (let day = 45; day >= 0; day--) {
        const salesToday = randInt(3, 9)
        for (let n = 0; n < salesToday; n++) {
          const available = inStock()
          if (available.length === 0) continue
          const lineCount = randInt(1, 4)
          const chosen = new Set<Sellable>()
          const items: Array<{ line: Sellable; qty: number }> = []
          let subtotal = 0
          for (let li = 0; li < lineCount; li++) {
            const line = pick(available)
            if (chosen.has(line) || line.level.qty <= 0) continue
            chosen.add(line)
            const maxQty = line.unit === 'kg' ? 3 : 4
            let qty = Math.min(randInt(1, maxQty), Math.floor(line.level.qty) || 1)
            if (line.unit === 'kg')
              qty = Math.min(Number((Math.random() * 2 + 0.5).toFixed(2)), line.level.qty)
            if (qty <= 0) continue
            items.push({ line, qty })
            subtotal += line.price * qty
          }
          if (items.length === 0) continue

          saleSeq++
          const soldAt = dateNDaysAgo(day, randInt(8, 19), randInt(0, 59))
          const method = pick(paymentMix)
          const attachCustomer = Math.random() < 0.35
          const customer = attachCustomer ? pick(customers) : null
          // ~4% of customer sales are on partial credit → creates a receivable debt.
          const onCredit = customer && creditDebts < 6 && Math.random() < 0.12
          const total = subtotal
          const amountPaid = onCredit ? Math.round(total * 0.5) : total
          const creditAmount = total - amountPaid

          const sale = await salesRepo.save(
            salesRepo.create({
              businessId,
              source: SaleSource.IN_STORE,
              clientId: uuid(),
              cashierId: owner.id,
              saleNumber: `INV-${String(saleSeq).padStart(5, '0')}`,
              status: SaleStatus.COMPLETED,
              subtotal,
              discountAmount: 0,
              chargesAmount: 0,
              taxAmount: 0,
              totalAmount: total,
              amountPaid,
              creditAmount,
              customerId: customer?.id ?? null,
              customerName: customer?.name ?? null,
              customerPhone: customer?.phone ?? null,
              paymentMethod: method,
              changeGiven: 0,
              saleDate: ymd(soldAt),
              soldAt,
            }),
          )

          for (const { line, qty } of items) {
            await saleItemsRepo.save(
              saleItemsRepo.create({
                saleId: sale.id,
                businessId,
                productId: line.productId,
                variantId: line.variantId,
                variantName: line.variantName,
                productName: line.productName,
                productSku: line.productSku,
                unitOfMeasure: line.unit,
                quantity: qty,
                unitPrice: line.price,
                discountAmount: 0,
                lineTotal: line.price * qty,
                totalPrice: line.price * qty,
                costPrice: line.cost,
              }),
            )
            const before = line.level.qty
            const after = Number((before - qty).toFixed(3))
            line.level.qty = after
            saleMovements.push(
              movementsRepo.create({
                businessId,
                productId: line.productId,
                variantId: line.variantId,
                type: MovementType.SALE,
                quantityChange: -qty,
                quantityBefore: before,
                quantityAfter: after,
                referenceType: 'SALE',
                referenceId: sale.id,
                notes: `Sale ${sale.saleNumber}`,
                performedById: owner.id,
              }),
            )
          }

          await salePaymentsRepo.save(
            salePaymentsRepo.create({
              saleId: sale.id,
              businessId,
              method,
              amount: amountPaid,
              kind: SalePaymentKind.PAYMENT,
            }),
          )

          if (onCredit && customer) {
            creditDebts++
            await debtsRepo.save(
              debtsRepo.create({
                businessId,
                contactId: customer.id,
                direction: DebtDirection.RECEIVABLE,
                sourceType: DebtSource.SALE,
                sourceId: sale.id,
                sourceReference: sale.saleNumber,
                originalAmount: creditAmount,
                status: DebtStatus.OUTSTANDING,
                dueDate: ymd(dateNDaysAgo(day - 30)),
                notes: 'Partial payment on sale.',
              }),
            )
          }
        }
      }
      await movementsRepo.save(saleMovements)

      // Persist decremented stock levels.
      for (const s of sellables) {
        await levelsRepo.update({ id: s.level.id }, { quantity: s.level.qty })
      }

      // ── Supplier opening-balance payables (materialised as debts) ──
      const supplierBalances = [
        { supplier: 'CFAO Distribution', amount: 850000 },
        { supplier: 'Brasseries du Cameroun', amount: 320000 },
        { supplier: 'Congelcam Frozen Foods', amount: 210000 },
      ]
      for (const sb of supplierBalances) {
        const sup = suppliers.find((s) => s.name === sb.supplier)
        if (!sup) continue
        await debtsRepo.save(
          debtsRepo.create({
            businessId,
            contactId: sup.id,
            direction: DebtDirection.PAYABLE,
            sourceType: DebtSource.OPENING_BALANCE,
            sourceId: sup.id,
            sourceReference: `OB-${sup.id.slice(0, 8)}`,
            originalAmount: sb.amount,
            status: DebtStatus.OUTSTANDING,
            notes: 'Opening balance owed to supplier.',
          }),
        )
      }

      return {
        productCount,
        variantCount,
        serialCount,
        expenses: expenses.length,
        saleSeq,
        creditDebts,
        payables: supplierBalances.length,
      }
    })

    console.log('\n✅ Demo store seeded successfully:')
    console.log(`   Business : ${BUSINESS_NAME} (${BUSINESS_SLUG}) — PRO plan`)
    console.log(`   Login    : ${OWNER_EMAIL} / ${OWNER_PASSWORD}`)
    console.log(
      `   Catalog  : ${summary.productCount} products, ${summary.variantCount} variants, ${summary.serialCount} serial units`,
    )
    console.log(`   Sections : ${CATEGORIES.length} categories, ${BRANDS.length} brands`)
    console.log(`   Contacts : ${CONTACTS.length}   Expenses: ${summary.expenses}`)
    console.log(
      `   Sales    : ${summary.saleSeq} over 45 days   Credit debts: ${summary.creditDebts} + ${summary.payables} payables`,
    )
  } finally {
    await ds.destroy()
  }
}

seed().catch(async (err) => {
  console.error('❌ Demo seed failed:', err)
  if (AppDataSource.isInitialized) await AppDataSource.destroy()
  process.exit(1)
})
