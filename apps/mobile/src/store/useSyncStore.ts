import { create } from 'zustand'

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error'

interface SyncState {
  status: SyncStatus
  pendingCount: number
  lastSyncedAt: string | null
  error: string | null

  // Setters
  setStatus: (status: SyncStatus) => void
  setPendingCount: (count: number) => void
  setLastSyncedAt: (timestamp: string | null) => void
  setError: (error: string | null) => void

  // Operations
  triggerSync: () => Promise<void>
}

export const useSyncStore = create<SyncState>((set, get) => ({
  status: 'idle',
  pendingCount: 0,
  lastSyncedAt: null,
  error: null,

  setStatus: (status) => set({ status }),
  setPendingCount: (count) => set({ pendingCount: count }),
  setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),
  setError: (error) => set({ error }),

  triggerSync: async () => {
    const { status, pendingCount } = get()
    if (status === 'syncing' || pendingCount === 0) return

    set({ status: 'syncing', error: null })
    
    // Simulate background sync processing
    try {
      await new Promise((resolve) => setTimeout(resolve, 2000))
      
      // Complete mock sync
      set({
        status: 'idle',
        pendingCount: 0,
        lastSyncedAt: new Date().toISOString(),
        error: null,
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'La synchronisation a échoué.'
      set({
        status: 'error',
        error: errorMessage,
      })
    }
  },
}))
