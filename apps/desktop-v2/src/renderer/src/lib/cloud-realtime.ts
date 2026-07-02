import { io, type Socket } from 'socket.io-client'
import { REALTIME_PATH, type NotificationEventPayload } from '@biztrack/types'
import { CLOUD_API_BASE_URL, getAccessToken } from './cloud-http'

/**
 * Cloud (browser) realtime notifications. Opens ONE Socket.IO connection to the app-wide
 * realtime gateway, authenticates with the in-memory ACCESS token (the gateway auto-joins
 * the user/business/device rooms), and fans `notification` out to listeners (the
 * notifications store via DataClient.onEvent).
 */

let socket: Socket | null = null
const listeners = new Set<(payload: NotificationEventPayload) => void>()

function origin(): string {
  try {
    return new URL(CLOUD_API_BASE_URL).origin
  } catch {
    return CLOUD_API_BASE_URL
  }
}

function authenticate(): void {
  const token = getAccessToken()
  if (token && socket) socket.emit('auth', { accessToken: token })
}

export async function cloudRealtimeConnect(): Promise<void> {
  if (socket || !getAccessToken()) return
  socket = io(origin(), {
    path: REALTIME_PATH,
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 2_000,
    reconnectionDelayMax: 30_000,
    withCredentials: true,
  })
  socket.on('connect', authenticate)
  socket.on('auth:expired', authenticate)
  socket.on('notification', (payload: NotificationEventPayload) => {
    listeners.forEach((l) => l(payload))
  })
}

export function cloudRealtimeOnEvent(cb: (payload: NotificationEventPayload) => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}
