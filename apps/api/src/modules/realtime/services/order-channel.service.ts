import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { Namespace, Socket } from 'socket.io'
import {
  REALTIME_ORDER_PAYMENT_EVENT,
  REALTIME_ORDER_SUBSCRIBE_EVENT,
  realtimeOrderChannel,
  type RealtimeOrderPaymentEvent,
} from '@biztrack/types'
import type { Logger } from '@biztrack/logger'
import { LOGGER } from '@/logger/logger.module'
import { OnlineOrder } from '@/entities/online-order.entity'

/** Tracking tokens are `crypto.randomUUID().replace(/-/g,'')` → 32 lowercase hex. */
const TRACKING_TOKEN_RE = /^[a-f0-9]{32}$/
/** A storefront socket only ever watches its own order(s) — cap rooms to stop room-flooding. */
const MAX_ROOMS_PER_SOCKET = 3

interface PublicSocketState {
  rooms: Set<string>
}

/**
 * Owns the anonymous `/public-orders` Socket.IO namespace (attached by RealtimeGateway to the shared
 * server, so it inherits the Redis adapter for cross-pod fan-out). A storefront customer connects with
 * no auth and subscribes to their order by its secret tracking token; PaymentAttemptsService emits the
 * live payment status into that room on settle. Same trust model as the public payment poll — the
 * unguessable token is the authorization, and the payload is only the tri-state + a whitelisted reason.
 */
@Injectable()
export class OrderChannelService {
  private ns: Namespace | null = null

  constructor(
    @InjectRepository(OnlineOrder)
    private readonly orders: Repository<OnlineOrder>,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  /** Wire the namespace (called once from the gateway on bootstrap). */
  attach(namespace: Namespace): void {
    this.ns = namespace
    namespace.on('connection', (socket) => this.onConnection(socket))
    this.logger.log('Public order channel ready', 'OrderChannelService', {
      namespace: namespace.name,
    })
  }

  detach(): void {
    this.ns = null
  }

  /** Push a payment status update to everyone watching `trackingToken`. No-op if not attached. */
  emitPaymentStatus(trackingToken: string, payload: RealtimeOrderPaymentEvent): void {
    if (!this.ns || !TRACKING_TOKEN_RE.test(trackingToken)) return
    this.ns.to(realtimeOrderChannel(trackingToken)).emit(REALTIME_ORDER_PAYMENT_EVENT, payload)
  }

  // ---- connection handling ----

  private onConnection(socket: Socket): void {
    ;(socket.data as { pub?: PublicSocketState }).pub = { rooms: new Set() }
    // Allow subscribing via the handshake (single round-trip) or an explicit frame.
    const fromHandshake =
      (socket.handshake.auth as { trackingToken?: unknown })?.trackingToken ??
      socket.handshake.query?.trackingToken
    if (typeof fromHandshake === 'string') void this.join(socket, fromHandshake)

    socket.on(REALTIME_ORDER_SUBSCRIBE_EVENT, (payload: unknown) => {
      const token =
        payload && typeof payload === 'object'
          ? (payload as { trackingToken?: unknown }).trackingToken
          : payload
      if (typeof token === 'string') void this.join(socket, token)
    })
  }

  private async join(socket: Socket, trackingToken: string): Promise<void> {
    const token = trackingToken.trim().toLowerCase()
    if (!TRACKING_TOKEN_RE.test(token)) {
      socket.emit('error', { code: 'BAD_REQUEST', message: 'Invalid tracking token.' })
      return
    }
    const state = (socket.data as { pub?: PublicSocketState }).pub
    if (!state || state.rooms.size >= MAX_ROOMS_PER_SOCKET) return

    // Validate the order exists (cheap indexed lookup) — avoids joining rooms for bogus tokens.
    const exists = (await this.orders.count({ where: { trackingToken: token } })) > 0
    if (!exists) {
      socket.emit('error', { code: 'NOT_FOUND', message: 'Order not found.' })
      return
    }
    const room = realtimeOrderChannel(token)
    await socket.join(room)
    state.rooms.add(room)
    socket.emit('order.subscribed', { trackingToken: token })
  }
}
