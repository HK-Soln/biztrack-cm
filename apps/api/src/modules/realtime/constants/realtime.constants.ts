import { REALTIME_PATH } from '@biztrack/types'

export { REALTIME_PATH }

// ---- Auth / lifecycle ----
/** Browser clients must send an `auth` frame within this window or be disconnected. */
export const REALTIME_AUTH_TIMEOUT_MS = 10_000
/** After the access token expires, the grace window to send a fresh `auth` frame. */
export const REALTIME_REAUTH_GRACE_MS = 30_000
/** How often the gateway checks each socket's token expiry. */
export const REALTIME_TOKEN_CHECK_MS = 20_000

// ---- Abuse limits ----
/** Max concurrent sockets per user; opening more evicts the oldest (close 4006). */
export const REALTIME_MAX_CONNECTIONS_PER_USER = 5
/** Inbound-frame rate limit: max frames per socket per window. */
export const REALTIME_INBOUND_WINDOW_MS = 10_000
export const REALTIME_INBOUND_MAX_FRAMES = 50
/** Socket.IO maxHttpBufferSize — caps inbound frame size. */
export const REALTIME_MAX_FRAME_BYTES = 16 * 1024
/** Drop a socket whose outbound buffer grows beyond this (slow consumer). */
export const REALTIME_MAX_BUFFERED_BYTES = 1 * 1024 * 1024

// ---- Redis adapter ----
/** Key prefix the Socket.IO Redis adapter uses for cross-pod fan-out. */
export const REALTIME_ADAPTER_KEY = 'biztrack:rt'
