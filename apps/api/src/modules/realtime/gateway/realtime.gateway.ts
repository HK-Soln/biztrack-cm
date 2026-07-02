import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import type { Server as HttpServer } from 'http'
import { Server as SocketIoServer, type Socket } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import type { Redis } from 'ioredis'
import {
  realtimeUserChannel,
  realtimeBusinessChannel,
  realtimeDeviceChannel,
} from '@biztrack/types'
import type { Logger } from '@biztrack/logger'
import { LOGGER } from '@/logger/logger.module'
import { RedisService } from '@/common/redis/redis.service'
import type { AppConfig } from '@/config/configuration'
import { NodeEnv } from '@/config/configuration'
import {
  REALTIME_ADAPTER_KEY,
  REALTIME_AUTH_TIMEOUT_MS,
  REALTIME_INBOUND_MAX_FRAMES,
  REALTIME_INBOUND_WINDOW_MS,
  REALTIME_MAX_CONNECTIONS_PER_USER,
  REALTIME_MAX_FRAME_BYTES,
  REALTIME_PATH,
  REALTIME_REAUTH_GRACE_MS,
  REALTIME_TOKEN_CHECK_MS,
} from '../constants/realtime.constants'
import { RealtimeAuthService } from '../services/realtime-auth.service'
import { RealtimeService } from '../services/realtime.service'
import { ChannelRegistry } from '../channels/channel-registry'
import type { Principal } from '../realtime.types'

interface SocketState {
  principal: Principal | null
  authTimer: NodeJS.Timeout | null
  graceTimer: NodeJS.Timeout | null
  windowStart: number
  frameCount: number
}

type RtSocket = Socket

const MAX_CHANNEL_LEN = 200

@Injectable()
export class RealtimeGateway implements OnApplicationBootstrap, OnApplicationShutdown {
  private server: SocketIoServer | null = null
  private pub: Redis | null = null
  private sub: Redis | null = null
  private tokenInterval: NodeJS.Timeout | null = null
  /** userId → local socket ids (per-pod connection-cap enforcement). */
  private readonly userSockets = new Map<string, Set<string>>()
  private allowedOrigins = new Set<string>()
  private allowAllOrigins = false

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly config: ConfigService<AppConfig>,
    private readonly redis: RedisService,
    private readonly authService: RealtimeAuthService,
    private readonly registry: ChannelRegistry,
    private readonly realtime: RealtimeService,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  onApplicationBootstrap(): void {
    const httpServer = this.httpAdapterHost.httpAdapter?.getHttpServer() as HttpServer | undefined
    if (!httpServer) {
      this.logger.warn('Realtime gateway could not attach to HTTP server', 'RealtimeGateway')
      return
    }

    this.computeOrigins()

    this.server = new SocketIoServer(httpServer, {
      path: REALTIME_PATH,
      maxHttpBufferSize: REALTIME_MAX_FRAME_BYTES,
      cors: {
        origin: (origin, cb) => this.checkOrigin(origin, cb),
        credentials: true,
      },
    })

    // Cross-pod room fan-out. A subscriber connection can't run normal commands, so the
    // adapter needs its own dedicated pub/sub pair.
    if (this.redis.isConfigured()) {
      this.pub = this.redis.duplicateConnection()
      this.sub = this.redis.duplicateConnection()
      this.server.adapter(createAdapter(this.pub, this.sub, { key: REALTIME_ADAPTER_KEY }))
    } else {
      this.logger.warn('Realtime running single-pod (REDIS_URL not configured)', 'RealtimeGateway')
    }

    this.server.on('connection', (socket: RtSocket) => this.handleConnection(socket))
    this.realtime.setServer(this.server)

    this.tokenInterval = setInterval(() => this.checkTokens(), REALTIME_TOKEN_CHECK_MS)

    this.logger.log('Realtime gateway ready', 'RealtimeGateway', { path: REALTIME_PATH })
  }

  onApplicationShutdown(): void {
    if (this.tokenInterval) clearInterval(this.tokenInterval)
    this.realtime.setServer(null)
    this.server?.close()
    this.pub?.disconnect()
    this.sub?.disconnect()
    this.server = null
  }

  // ---- connection lifecycle ----

  private handleConnection(socket: RtSocket): void {
    const state: SocketState = {
      principal: null,
      authTimer: null,
      graceTimer: null,
      windowStart: Date.now(),
      frameCount: 0,
    }
    ;(socket.data as { rt?: SocketState }).rt = state

    // Header / handshake-auth path (desktop, server-to-server): authenticate immediately.
    const handshakeToken = this.extractHandshakeToken(socket)
    if (handshakeToken) {
      void this.authenticate(socket, handshakeToken)
    }

    // Browser path: no custom handshake headers — require an `auth` frame within the window.
    if (!state.principal) {
      state.authTimer = setTimeout(() => {
        this.sendError(socket, 'AUTH_TIMEOUT', 'Authentication timed out.')
        socket.disconnect(true)
      }, REALTIME_AUTH_TIMEOUT_MS)
    }

    socket.on('auth', (payload: unknown) => {
      if (!this.allowFrame(socket)) return
      const token = this.readToken(payload)
      if (!token) {
        this.sendError(socket, 'UNAUTHORIZED', 'Missing token.')
        return
      }
      void this.authenticate(socket, token)
    })

    socket.on('subscribe', (payload: unknown) => void this.onSubscribe(socket, payload))
    socket.on('unsubscribe', (payload: unknown) => this.onUnsubscribe(socket, payload))
    socket.on('disconnect', () => this.handleDisconnect(socket))
  }

  private async authenticate(socket: RtSocket, token: string): Promise<void> {
    const state = this.state(socket)
    if (!state) return

    const principal = this.authService.verifyAccessToken(token)
    if (!principal) {
      this.sendError(socket, 'UNAUTHORIZED', 'Invalid or expired token.')
      socket.disconnect(true)
      return
    }

    if (state.authTimer) {
      clearTimeout(state.authTimer)
      state.authTimer = null
    }
    if (state.graceTimer) {
      clearTimeout(state.graceTimer)
      state.graceTimer = null
    }

    const firstAuth = !state.principal
    state.principal = principal
    if (firstAuth) this.trackUser(socket, principal.userId)

    await this.autoJoin(socket, principal)
    socket.emit('auth:success', { userId: principal.userId })
  }

  /** On auth, auto-join the rooms derivable (and authorized) from the token. */
  private async autoJoin(socket: RtSocket, principal: Principal): Promise<void> {
    await socket.join(realtimeUserChannel(principal.userId))
    if (principal.deviceId) await socket.join(realtimeDeviceChannel(principal.deviceId))
    if (
      principal.type === 'phase2' &&
      principal.businessId &&
      (await this.authService.hasActiveMembership(principal.businessId, principal.userId))
    ) {
      await socket.join(realtimeBusinessChannel(principal.businessId))
    }
  }

  private async onSubscribe(socket: RtSocket, payload: unknown): Promise<void> {
    if (!this.allowFrame(socket)) return
    const state = this.state(socket)
    if (!state?.principal) {
      this.sendError(socket, 'UNAUTHORIZED', 'Not authenticated.')
      return
    }
    const channel = this.readChannel(payload)
    if (!channel) {
      this.sendError(socket, 'BAD_REQUEST', 'Invalid channel.')
      return
    }
    const allowed = await this.registry.authorize(state.principal, channel)
    if (!allowed) {
      this.sendError(socket, 'FORBIDDEN_CHANNEL', `Not allowed to subscribe: ${channel}`)
      return
    }
    await socket.join(channel)
    socket.emit('subscribed', { channel })
  }

  private onUnsubscribe(socket: RtSocket, payload: unknown): void {
    if (!this.allowFrame(socket)) return
    const channel = this.readChannel(payload)
    if (!channel) return
    void socket.leave(channel)
    socket.emit('unsubscribed', { channel })
  }

  private handleDisconnect(socket: RtSocket): void {
    const state = this.state(socket)
    if (state?.authTimer) clearTimeout(state.authTimer)
    if (state?.graceTimer) clearTimeout(state.graceTimer)
    const userId = state?.principal?.userId
    if (userId) {
      const set = this.userSockets.get(userId)
      set?.delete(socket.id)
      if (set && set.size === 0) this.userSockets.delete(userId)
    }
  }

  /** Periodically expire stale tokens: prompt re-auth, then disconnect after the grace. */
  private checkTokens(): void {
    if (!this.server) return
    const now = Math.floor(Date.now() / 1000)
    for (const [, socket] of this.server.sockets.sockets) {
      const state = this.state(socket)
      if (!state?.principal?.exp || state.graceTimer) continue
      if (state.principal.exp <= now) {
        socket.emit('auth:expired', {})
        state.graceTimer = setTimeout(() => {
          this.sendError(socket, 'TOKEN_EXPIRED', 'Access token expired.')
          socket.disconnect(true)
        }, REALTIME_REAUTH_GRACE_MS)
      }
    }
  }

  // ---- connection cap (local/per-pod) ----

  private trackUser(socket: RtSocket, userId: string): void {
    let set = this.userSockets.get(userId)
    if (!set) {
      set = new Set()
      this.userSockets.set(userId, set)
    }
    set.add(socket.id)
    while (set.size > REALTIME_MAX_CONNECTIONS_PER_USER) {
      const oldest = set.values().next().value as string | undefined
      if (!oldest || oldest === socket.id) break
      set.delete(oldest)
      const victim = this.server?.sockets.sockets.get(oldest)
      if (victim) {
        this.sendError(victim, 'REPLACED', 'Connection limit reached; older session closed.')
        victim.disconnect(true)
      }
    }
  }

  // ---- helpers ----

  private state(socket: RtSocket): SocketState | null {
    return (socket.data as { rt?: SocketState }).rt ?? null
  }

  private allowFrame(socket: RtSocket): boolean {
    const state = this.state(socket)
    if (!state) return false
    const now = Date.now()
    if (now - state.windowStart > REALTIME_INBOUND_WINDOW_MS) {
      state.windowStart = now
      state.frameCount = 0
    }
    state.frameCount += 1
    if (state.frameCount > REALTIME_INBOUND_MAX_FRAMES) {
      this.sendError(socket, 'RATE_LIMITED', 'Too many messages.')
      socket.disconnect(true)
      return false
    }
    return true
  }

  private extractHandshakeToken(socket: RtSocket): string | null {
    const auth = socket.handshake.auth as { token?: string; accessToken?: string } | undefined
    const fromAuth = auth?.accessToken ?? auth?.token
    if (typeof fromAuth === 'string' && fromAuth) return fromAuth
    const header = socket.handshake.headers.authorization
    if (header?.startsWith('Bearer ')) return header.slice(7)
    return null
  }

  private readToken(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') return null
    const token = (payload as { accessToken?: unknown; token?: unknown }).accessToken ??
      (payload as { token?: unknown }).token
    return typeof token === 'string' && token.length > 0 ? token : null
  }

  private readChannel(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') return null
    const channel = (payload as { channel?: unknown }).channel
    if (typeof channel !== 'string' || channel.length === 0 || channel.length > MAX_CHANNEL_LEN) return null
    return channel
  }

  private sendError(socket: RtSocket, code: string, message: string): void {
    socket.emit('error', { code, message })
  }

  private checkOrigin(
    origin: string | undefined,
    cb: (err: Error | null, allow?: boolean) => void,
  ): void {
    if (!origin || this.allowAllOrigins || this.allowedOrigins.has(origin)) {
      cb(null, true)
      return
    }
    cb(null, false)
  }

  private computeOrigins(): void {
    const raw = this.config.get('CORS_ORIGINS', { infer: true }) ?? ''
    const origins = raw
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean)
    this.allowedOrigins = new Set(origins)
    // Mirror HTTP CORS: in non-production with no explicit list, allow all (dev).
    const isProd = this.config.get('NODE_ENV', { infer: true }) === NodeEnv.PRODUCTION
    this.allowAllOrigins = origins.length === 0 && !isProd
  }
}
