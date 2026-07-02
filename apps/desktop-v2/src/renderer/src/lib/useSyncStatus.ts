import { useEffect, useState } from 'react'
import type { SyncStatus } from '@shared/ipc'
import { dataClient } from '@/lib/data-client'

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
    void dataClient.sync.getStatus().then(setStatus).catch(() => {})
    return dataClient.sync.onStatus(setStatus)
  }, [])
  return status
}
