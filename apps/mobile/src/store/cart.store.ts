import { create } from 'zustand'
import type { Product } from '../services/products.service'
import type { Contact } from './useContactsStore'

export type PaymentMethod = 'CASH' | 'MOBILE_MONEY' | 'CARD' | 'CREDIT'

export interface CartItem {
  product: Product
  quantity: number
}

interface CartState {
  items: CartItem[]
  paymentMethod: PaymentMethod
  discountAmount: number
  customer: Contact | null
  addItem: (product: Product, quantity?: number) => void
  removeItem: (productId: string) => void
  updateQuantity: (productId: string, quantity: number) => void
  clear: () => void
  subtotal: () => number
  total: () => number
  itemCount: () => number
  setPaymentMethod: (method: PaymentMethod) => void
  setDiscount: (amount: number) => void
  setCustomer: (customer: Contact | null) => void
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  paymentMethod: 'CASH',
  discountAmount: 0,
  customer: null,
  addItem: (product, quantity = 1) =>
    set((state) => {
      const existing = state.items.find((i) => i.product.id === product.id)
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.product.id === product.id ? { ...i, quantity: i.quantity + quantity } : i
          ),
        }
      }
      return { items: [...state.items, { product, quantity }] }
    }),
  removeItem: (productId) =>
    set((state) => ({ items: state.items.filter((i) => i.product.id !== productId) })),
  updateQuantity: (productId, quantity) =>
    set((state) => ({
      items:
        quantity <= 0
          ? state.items.filter((i) => i.product.id !== productId)
          : state.items.map((i) => (i.product.id === productId ? { ...i, quantity } : i)),
    })),
  clear: () =>
    set({
      items: [],
      paymentMethod: 'CASH',
      discountAmount: 0,
      customer: null,
    }),
  subtotal: () =>
    get().items.reduce((sum, i) => sum + i.product.price * i.quantity, 0),
  total: () =>
    Math.max(0, get().subtotal() - get().discountAmount),
  itemCount: () =>
    get().items.reduce((sum, i) => sum + i.quantity, 0),
  setPaymentMethod: (method) => set({ paymentMethod: method }),
  setDiscount: (amount) => set((state) => ({
    // Clamp to [0, subtotal] — prevents negative discounts and over-discounting
    discountAmount: Math.min(Math.max(0, amount), state.items.reduce((s, i) => s + i.product.price * i.quantity, 0)),
  })),
  setCustomer: (customer) => set({ customer }),
}))

