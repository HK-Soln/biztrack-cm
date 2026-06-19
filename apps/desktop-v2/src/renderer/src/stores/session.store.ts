import { create } from 'zustand'
import type { SessionStatus } from '@shared/ipc'

const EMPTY: SessionStatus = {
  authenticated: false,
  phase: 'none',
  isOffline: false,
  user: null,
  businessId: null,
  businessName: null,
  businessCurrency: null,
  nextStep: null,
}

interface SessionState {
  status: SessionStatus
  hydrated: boolean
  /** Pull the current session status from main (BFF). */
  refresh: () => Promise<void>
  /** Set after an auth-flow step returns its refreshed session. */
  setStatus: (status: SessionStatus) => void
  logout: () => Promise<void>
}

export const useSessionStore = create<SessionState>((set) => ({
  status: EMPTY,
  hydrated: false,
  refresh: async () => {
    if (!window.api?.auth) {
      // Browser/cloud build: no IPC bridge yet (cloud adapter lands later).
      set({ status: EMPTY, hydrated: true })
      return
    }
    try {
      const status = await window.api.auth.getSession()
      set({ status, hydrated: true })
    } catch {
      set({ status: EMPTY, hydrated: true })
    }
  },
  setStatus: (status) => set({ status }),
  logout: async () => {
    const status = window.api?.auth ? await window.api.auth.logout() : EMPTY
    set({ status })
  },
}))
