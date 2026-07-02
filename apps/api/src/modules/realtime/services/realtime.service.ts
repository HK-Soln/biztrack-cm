import { Inject, Injectable } from '@nestjs/common'
import type { Server as SocketIoServer } from 'socket.io'
import {
  realtimeUserChannel,
  realtimeBusinessChannel,
  realtimeDeviceChannel,
  type RealtimeServerEventName,
  type RealtimeServerEvents,
} from '@biztrack/types'
import type { Logger } from '@biztrack/logger'
import { LOGGER } from '@/logger/logger.module'

/**
 * The app-wide realtime PUBLISHER. Any module injects this and calls toUser/toBusiness/
 * toDevice — strongly typed against the shared RealtimeServerEvents map. Modules never
 * touch the gateway; cross-pod fan-out is handled by the Socket.IO Redis adapter, so an
 * emit on any pod reaches the right sockets everywhere.
 *
 * The gateway registers its Socket.IO server here on bootstrap (setServer).
 */
@Injectable()
export class RealtimeService {
  private server: SocketIoServer | null = null

  constructor(@Inject(LOGGER) private readonly logger: Logger) {
    this.logger.setContext?.('RealtimeService')
  }

  /** Wired by RealtimeGateway once the Socket.IO server is up (null on shutdown). */
  setServer(server: SocketIoServer | null): void {
    this.server = server
  }

  toUser<E extends RealtimeServerEventName>(userId: string, event: E, payload: RealtimeServerEvents[E]): void {
    this.emit(realtimeUserChannel(userId), event, payload)
  }

  toBusiness<E extends RealtimeServerEventName>(
    businessId: string,
    event: E,
    payload: RealtimeServerEvents[E],
    opts?: { topic?: string },
  ): void {
    this.emit(realtimeBusinessChannel(businessId, opts?.topic), event, payload)
  }

  toDevice<E extends RealtimeServerEventName>(deviceId: string, event: E, payload: RealtimeServerEvents[E]): void {
    this.emit(realtimeDeviceChannel(deviceId), event, payload)
  }

  /** Force-disconnect a user's sockets (e.g. membership revocation). Cross-pod via the adapter. */
  revokeUser(userId: string): void {
    try {
      void this.server?.in(realtimeUserChannel(userId)).disconnectSockets(true)
    } catch (err) {
      this.logger.warn('Realtime revokeUser failed', 'RealtimeService', {
        userId,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  private emit(room: string, event: string, payload: unknown): void {
    if (!this.server) return
    try {
      this.server.to(room).emit(event, payload)
    } catch (err) {
      // Fire-and-forget: never let a realtime emit break the calling business op.
      this.logger.warn('Realtime emit failed', 'RealtimeService', {
        room,
        event,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }
}
