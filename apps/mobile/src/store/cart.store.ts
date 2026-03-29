import { create } from 'zustand'
import type { Product } from '@biztrack/types'

interface CartItem {
  product: Product
  quantity: number
}

interface CartState {
  items: CartItem[]
  addItem: (product: Product, quantity?: number) => void
  removeItem: (productId: string) => void
  updateQuantity: (productId: string, quantity: number) => void
  clear: () => void
  total: () => number
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  addItem: (product, quantity = 1) =>
    set((state) => {
      const existing = state.items.find((i) => i.product.id === product.id)
      if (existing) {
        return { items: state.items.map((i) => i.product.id === product.id ? { ...i, quantity: i.quantity + quantity } : i) }
      }
      return { items: [...state.items, { product, quantity }] }
    }),
  removeItem: (productId) =>
    set((state) => ({ items: state.items.filter((i) => i.product.id !== productId) })),
  updateQuantity: (productId, quantity) =>
    set((state) => ({ items: quantity <= 0
      ? state.items.filter((i) => i.product.id !== productId)
      : state.items.map((i) => i.product.id === productId ? { ...i, quantity } : i)
    })),
  clear: () => set({ items: [] }),
  total: () => get().items.reduce((sum, i) => sum + i.product.price * i.quantity, 0),
}))
