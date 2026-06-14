'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface CartSessionState {
  /** Opaque cart session token issued by the API on first add. */
  sessionToken: string | null
  setSessionToken: (token: string) => void
  clear: () => void
}

/** Persists the cart session token so the cart survives reloads (Zustand). */
export const useCartSession = create<CartSessionState>()(
  persist(
    (set) => ({
      sessionToken: null,
      setSessionToken: (token) => set({ sessionToken: token }),
      clear: () => set({ sessionToken: null }),
    }),
    { name: 'biztrack-cart-session' },
  ),
)
