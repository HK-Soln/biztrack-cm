import { EventEmitter } from 'events'
import { net } from 'electron'

export class NetworkService extends EventEmitter {
  private _isOnline = true
  private checkInterval: NodeJS.Timeout | null = null

  start() {
    this.checkInterval = setInterval(() => this.checkConnectivity(), 30_000)
    this.checkConnectivity()
  }

  stop() {
    if (this.checkInterval) clearInterval(this.checkInterval)
  }

  get isOnline() {
    return this._isOnline
  }

  private checkConnectivity() {
    const online = net.isOnline()
    if (online !== this._isOnline) {
      this._isOnline = online
      this.emit('change', online)
    }
  }
}
