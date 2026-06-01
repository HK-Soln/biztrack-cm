import AsyncStorage from '@react-native-async-storage/async-storage'
import { db } from '../db'
import { sales, saleItems, products, debts } from '../db/schema'
import { eq, sql, gte, and } from 'drizzle-orm'
import type { PaymentMethod } from '@/store/cart.store'
import { generateUUID } from '../utils/uuid'
import { useAuthStore } from '../store/useAuthStore'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SaleLineItem {
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  subtotal: number
}

export interface CreateSalePayload {
  items: SaleLineItem[]
  paymentMethod: PaymentMethod
  discountAmount?: number
  customerId?: string
  note?: string
}

export interface Sale {
  id: string
  receiptNumber: string
  items: SaleLineItem[]
  paymentMethod: PaymentMethod
  subtotal: number
  discountAmount: number
  total: number
  customerId?: string
  note?: string
  createdAt: string
}

// ─── Persistent receipt counter ───────────────────────────────────────────────

const RECEIPT_COUNTER_KEY = 'biztrack_receipt_counter'
let receiptCounterLocked = false
const receiptCounterQueue: (() => void)[] = []

async function acquireReceiptCounterLock(): Promise<void> {
  return new Promise((resolve) => {
    if (!receiptCounterLocked) {
      receiptCounterLocked = true
      resolve()
    } else {
      receiptCounterQueue.push(resolve)
    }
  })
}

function releaseReceiptCounterLock(): void {
  const next = receiptCounterQueue.shift()
  if (next) {
    next()
  } else {
    receiptCounterLocked = false
  }
}

async function nextReceiptCounter(): Promise<number> {
  const stored = await AsyncStorage.getItem(RECEIPT_COUNTER_KEY)
  const next = stored ? parseInt(stored, 10) + 1 : 1
  await AsyncStorage.setItem(RECEIPT_COUNTER_KEY, String(next))
  return next
}

async function generateLocalReceiptNumber(): Promise<string> {
  await acquireReceiptCounterLock()
  try {
    const seq = await nextReceiptCounter()
    const now = new Date()
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
    return `BT-${date}-${String(seq).padStart(4, '0')}`
  } finally {
    releaseReceiptCounterLock()
  }
}

// ─── Production SQLite Caching Database Checkout ──────────────────────────────

export async function createSale(payload: CreateSalePayload): Promise<Sale> {
  // Guard: CREDIT sales require a customer so the receivable can be attributed
  if (payload.paymentMethod === 'CREDIT' && !payload.customerId) {
    throw new Error('Un client est obligatoire pour les ventes à crédit.')
  }

  // Pull identity from auth store — avoids hardcoded placeholder strings
  const authState = useAuthStore.getState()
  const businessId = authState.business?.id
  const cashierId = authState.user?.id
  if (!businessId || !cashierId) {
    throw new Error('Session non initialisée. Veuillez vous reconnecter.')
  }

  const saleId = generateUUID()
  const now = new Date()

  // Recalculate from source values to ensure arithmetic safety
  const subtotal = payload.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const discountAmount = payload.discountAmount ?? 0
  const total = Math.max(0, subtotal - discountAmount)

  let receiptNumber = ''

  // Run everything inside an ACID transaction to guarantee stock consistency
  await db.transaction(async (tx) => {
    // Generate receipt number inside transaction for atomicity
    receiptNumber = await generateLocalReceiptNumber()
    // 1. Insert into sales table
    await tx.insert(sales).values({
      id: saleId,
      businessId,
      cashierId,
      customerId: payload.customerId || null,
      deviceId: 'mobile-device',
      totalAmount: subtotal,
      discountAmount,
      taxAmount: 0,
      netAmount: total,
      paymentMethod: payload.paymentMethod,
      momoReference: null,
      receiptNumber,
      status: 'COMPLETED',
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    })

    // 2. Insert line items and decrement product stocks
    for (const item of payload.items) {
      const itemId = generateUUID()
      
      // Insert item
      const lineItemTotal = item.quantity * item.unitPrice
      await tx.insert(saleItems).values({
        id: itemId,
        saleId,
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: lineItemTotal,
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
      })

      // Decrement stock with validation to prevent negative inventory
      const updateResult = await tx
        .update(products)
        .set({
          stockQuantity: sql`${products.stockQuantity} - ${item.quantity}`,
          updatedAt: now,
        })
        .where(and(eq(products.id, item.productId), gte(products.stockQuantity, item.quantity)))

      // Verify update succeeded; if no rows affected, stock was insufficient
      if (updateResult.changes === 0) {
        throw new Error(`Insufficient stock for product "${item.productName}": required ${item.quantity}, available check failed`)
      }
    }

    // 3. Auto-ledger outstanding Debt receivable if paymentMethod is CREDIT
    // (customerId is guaranteed to be present — guarded at function entry above)
    if (payload.paymentMethod === 'CREDIT' && payload.customerId) {
      const debtId = generateUUID()
      // Default due date: 30 days from now (local calendar)
      const dueDate = new Date()
      dueDate.setDate(dueDate.getDate() + 30)
      const d = dueDate
      const dueDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

      await tx.insert(debts).values({
        id: debtId,
        businessId,
        contactId: payload.customerId,
        direction: 'RECEIVABLE',
        sourceType: 'SALE',
        sourceId: saleId,
        sourceReference: receiptNumber,
        originalAmount: total,
        paidAmount: 0,
        outstandingAmount: total,
        status: 'OUTSTANDING',
        dueDate: dueDateStr,
        notes: payload.note || 'Vente à crédit',
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
      })
    }
  })

  return {
    id: saleId,
    receiptNumber,
    items: payload.items,
    paymentMethod: payload.paymentMethod,
    subtotal,
    discountAmount,
    total,
    customerId: payload.customerId,
    note: payload.note,
    createdAt: now.toISOString(),
  }
}
