import { io, type Socket } from 'socket.io-client'
import { REALTIME_PATH, type NotificationEventPayload } from '@biztrack/types'

export { REALTIME_PATH }

export interface RealtimeClientOptions {
  /** Same base URL the BFF uses (already includes /api/v1). Only the origin is used. */
  apiBaseUrl: string
  /** Current ACCESS token, or null when not signed in. The realtime layer is access-token
   * only — the sync token stays scoped to SyncModule's HTTP requests. */
  getAccessToken: () => string | null
  /** Pushed when an in-app notification arrives for this user. */
  onNotification: (payload: NotificationEventPayload) => void
  onConnectionChange?: (connected: boolean) => void
  /** Override the realtime path (defaults to REALTIME_PATH). */
  path?: string
}

/**
 * Global realtime client (main-process only). Opens ONE Socket.IO connection to the
 * app-wide realtime gateway, authenticates with the access token (the gateway auto-joins
 * the user/business/device rooms), and relays `notification` events to the host. Re-auths
 * on every (re)connect with the freshest access token; on `auth:expired` it re-auths too.
 */
export class RealtimeClient {
  private socket: Socket | null = null

  constructor(private readonly opts: RealtimeClientOptions) {}

  /** Open the connection if an access token is available. Idempotent. */
  start(): void {
    if (this.socket) {
      this.refreshAuth()
      return
    }
    if (!this.opts.getAccessToken()) return

    this.socket = io(this.originOf(this.opts.apiBaseUrl), {
      path: this.opts.path ?? REALTIME_PATH,
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 2_000,
      reconnectionDelayMax: 30_000,
    })

    this.socket.on('connect', () => this.authenticate())
    this.socket.on('auth:success', () => this.opts.onConnectionChange?.(true))
    this.socket.on('auth:expired', () => this.authenticate())
    this.socket.on('disconnect', () => this.opts.onConnectionChange?.(false))
    this.socket.on('notification', (payload: NotificationEventPayload) => {
      this.opts.onNotification(payload)
    })
  }

  /** (Re)authenticate — call after the access token changes (e.g. re-login/refresh). */
  refreshAuth(): void {
    if (!this.socket) {
      this.start()
      return
    }
    if (this.socket.connected) this.authenticate()
    else this.socket.connect()
  }

  stop(): void {
    this.socket?.removeAllListeners()
    this.socket?.disconnect()
    this.socket = null
  }

  private authenticate(): void {
    const accessToken = this.opts.getAccessToken()
    if (!accessToken || !this.socket) return
    this.socket.emit('auth', { accessToken })
  }

  private originOf(apiBaseUrl: string): string {
    try {
      const u = new URL(apiBaseUrl)
      return `${u.protocol}//${u.host}`
    } catch {
      return apiBaseUrl
    }
  }
}
