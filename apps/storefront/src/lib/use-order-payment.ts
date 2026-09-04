'use client'

import { useEffect, useRef } from 'react'
import { io, type Socket } from 'socket.io-client'
import {
  REALTIME_ORDER_PAYMENT_EVENT,
  REALTIME_PATH,
  REALTIME_PUBLIC_ORDERS_NAMESPACE,
  type RealtimeOrderPaymentEvent,
} from '@biztrack/types'
import { API_BASE_URL } from './config'

// The realtime server shares the API host; API_BASE_URL carries the /api/v1 suffix, the socket path
// carries its own, so connect to the bare origin + the public-orders namespace.
const WS_ORIGIN = (() => {
  try {
    return new URL(API_BASE_URL).origin
  } catch {
    return ''
  }
})()

/**
 * Subscribe to an order's live payment status over the anonymous `/public-orders` namespace (keyed by
 * the secret tracking token). Primary transport for the payment page; the HTTP poll remains the
 * fallback, and both simply drive the same terminal state, so a missed/absent socket is harmless.
 * `onStatus` is held in a ref so changing it never tears down the connection.
 */
export function useOrderPaymentEvents(
  trackingToken: string,
  enabled: boolean,
  onStatus: (payload: RealtimeOrderPaymentEvent) => void,
): void {
  const cb = useRef(onStatus)
  cb.current = onStatus

  useEffect(() => {
    if (!enabled || !WS_ORIGIN) return
    let socket: Socket | null = null
    try {
      socket = io(`${WS_ORIGIN}${REALTIME_PUBLIC_ORDERS_NAMESPACE}`, {
        path: REALTIME_PATH,
        transports: ['websocket'],
        auth: { trackingToken },
        reconnectionAttempts: 5,
        timeout: 8000,
      })
      socket.on(REALTIME_ORDER_PAYMENT_EVENT, (payload: RealtimeOrderPaymentEvent) => {
        if (payload && (payload.status === 'PAID' || payload.status === 'FAILED')) cb.current(payload)
      })
    } catch {
      // Socket unavailable → the poll fallback carries the page.
    }
    return () => {
      socket?.disconnect()
    }
  }, [trackingToken, enabled])
}
