import { create } from 'zustand'
import type { User, AuthTokens } from '@biztrack/types'

interface AuthState {
  user: User | null
  tokens: AuthTokens | null
  isAuthenticated: boolean
  setAuth: (user: User, tokens: AuthTokens) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  tokens: null,
  isAuthenticated: false,
  setAuth: (user, tokens) => set({ user, tokens, isAuthenticated: true }),
  clearAuth: () => set({ user: null, tokens: null, isAuthenticated: false }),
}))
