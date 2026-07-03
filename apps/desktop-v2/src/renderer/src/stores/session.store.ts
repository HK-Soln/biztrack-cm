import { create } from 'zustand'
import type { SessionStatus } from '@shared/ipc'
import { dataClient } from '@/lib/data-client'

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
    try {
      const status = await dataClient.auth.getSession()
      set({ status, hydrated: true })
    } catch {
      // Electron with no session, or cloud with no/expired cookie → signed out.
      set({ status: EMPTY, hydrated: true })
    }
  },
  setStatus: (status) => set({ status }),
  logout: async () => {
    try {
      set({ status: await dataClient.auth.logout() })
    } catch {
      set({ status: EMPTY })
    }
  },
}))
