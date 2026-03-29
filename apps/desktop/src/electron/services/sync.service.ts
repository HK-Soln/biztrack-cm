import { EventEmitter } from 'events'
import { NetworkService } from './network.service'

export class SyncService extends EventEmitter {
  private isSyncing = false
  private lastSyncedAt: string | null = null

  constructor(private network: NetworkService) {
    super()
    // Auto-sync when network comes back online
    network.on('change', (online: boolean) => {
      if (online) this.sync()
    })
  }

  async sync(): Promise<{ success: boolean; message: string }> {
    if (!this.network.isOnline) {
      return { success: false, message: 'offline' }
    }
    if (this.isSyncing) {
      return { success: false, message: 'already_syncing' }
    }

    this.isSyncing = true
    this.emit('status', 'syncing')

    try {
      // TODO: implement push/pull against API
      // This mirrors the mobile sync engine
      await new Promise((r) => setTimeout(r, 500)) // placeholder

      this.lastSyncedAt = new Date().toISOString()
      this.emit('status', 'synced')
      return { success: true, message: 'synced' }
    } catch (err) {
      this.emit('status', 'error')
      return { success: false, message: 'error' }
    } finally {
      this.isSyncing = false
    }
  }
}
