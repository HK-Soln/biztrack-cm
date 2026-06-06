import { create } from 'zustand'
import { db } from '../db'
import { sales, saleItems } from '../db/schema'
import { eq } from 'drizzle-orm'
import type { PaymentMethod } from './cart.store'

// ─── Shared Types ────────────────────────────────────────────────────────────

export interface SaleLineItem {
  id: string
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  totalPrice: number
}

export interface Sale {
  id: string
  receiptNumber: string
  items: SaleLineItem[]
  paymentMethod: PaymentMethod
  subtotal: number
  discountAmount: number
  total: number
  customerId?: string | null
  createdAt: string
}

// ─── State Interface ─────────────────────────────────────────────────────────

interface SalesState {
  sales: Sale[]
  isLoading: boolean
  error: string | null

  fetchSales: () => Promise<void>
  addSaleToState: (sale: Sale) => void
  clearStore: () => void
}

// ─── Sales Store (SQLite Cache Layer) ────────────────────────────────────────

export const useSalesStore = create<SalesState>((set) => ({
  sales: [],
  isLoading: false,
  error: null,

  fetchSales: async () => {
    set({ isLoading: true, error: null })
    try {
      // Filter soft-deleted rows so voided sales don't re-appear in the cache
      const resultsSales = await db
        .select()
        .from(sales)
        .where(eq(sales.isDeleted, false))
      const resultsSaleItems = await db
        .select()
        .from(saleItems)
        .where(eq(saleItems.isDeleted, false))

      // Group sale items by saleId
      const itemsMap: Record<string, SaleLineItem[]> = {}
      resultsSaleItems.forEach((item) => {
        const lineItem: SaleLineItem = {
          id: item.id,
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
        }
        if (!itemsMap[item.saleId]) {
          itemsMap[item.saleId] = []
        }
        itemsMap[item.saleId].push(lineItem)
      })

      // Sort sales by createdAt descending.
      // Drizzle returns createdAt as a JS Date (timestamp mode) — .getTime() is safe.
      const sortedSales = [...resultsSales].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      )

      // Map to Sale interface
      const formattedSales: Sale[] = sortedSales.map((s) => {
        const saleItemsList = itemsMap[s.id] || []
        const subtotal = saleItemsList.reduce((sum, item) => sum + item.totalPrice, 0)
        return {
          id: s.id,
          receiptNumber: s.receiptNumber,
          items: saleItemsList,
          paymentMethod: s.paymentMethod as PaymentMethod,
          subtotal,
          discountAmount: s.discountAmount,
          total: s.netAmount,
          customerId: s.customerId,
          createdAt: s.createdAt.toISOString(),
        }
      })

      set({ sales: formattedSales, error: null })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error fetching sales'
      set({ error: errorMessage })
    } finally {
      set({ isLoading: false })
    }
  },

  addSaleToState: (sale) => {
    set((state) => ({
      sales: [sale, ...state.sales],
    }))
  },

  clearStore: () => set({ sales: [] }),
}))
