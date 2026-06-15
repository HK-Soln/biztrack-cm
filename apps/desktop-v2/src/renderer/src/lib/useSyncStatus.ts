import { useEffect, useState } from 'react'
import type { SyncStatus } from '@shared/ipc'

const EMPTY: SyncStatus = {
  state: 'idle',
  lastSyncedAt: null,
  pendingCount: 0,
  deferredCount: 0,
  failedCount: 0,
  deadCount: 0,
  lastError: null,
}

/** Live sync status from the main-process engine (initial fetch + status events). */
export function useSyncStatus(): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>(EMPTY)
  useEffect(() => {
    const api = window.api?.sync
    if (!api) return
    void api.getStatus().then(setStatus).catch(() => {})
    return api.onStatus(setStatus)
  }, [])
  return status
}
