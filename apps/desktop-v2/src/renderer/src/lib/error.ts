/**
 * Raw transport/network failures — the request never got a response back (server down or
 * restarting, gateway 5xx with no CORS headers, DNS/connection error, timeout). The browser
 * (`Failed to fetch`, `NetworkError`, `Load failed`) and Node/undici (`fetch failed`,
 * `ECONNREFUSED`, `socket hang up`, aborted) surface these as low-level strings that must NEVER
 * be shown to the user — there is no API message to show, so callers use a friendly fallback.
 */
export function isTransportError(raw: string): boolean {
  return /failed to fetch|fetch failed|networkerror|network request failed|load failed|err_network|econnrefused|econnreset|enotfound|etimedout|socket hang up|terminated|aborted/i.test(
    raw,
  )
}

/**
 * Clean message from an error thrown either across the Electron IPC bridge (desktop) or by the
 * cloud HTTP client (browser build).
 *
 * - Cloud/HTTP errors (HttpError) carry the API envelope on `response.data` — the real message is
 *   `response.data.message`, not `e.message` (which is just "Request failed with status 400").
 * - A genuine transport failure (no response) surfaces as "Failed to fetch" / "fetch failed" — that
 *   is noise, so we show the caller's contextual fallback rather than the raw string.
 * - Electron wraps main-process errors as
 *   "Error invoking remote method 'products:add-variant': Error: <real message>" — we only want
 *   the real message.
 */
export function errorMessage(e: unknown, fallback = 'Something went wrong.'): string {
  // Prefer the backend error envelope surfaced by the cloud HTTP client.
  const data = (e as { response?: { data?: unknown } } | null | undefined)?.response?.data
  if (data && typeof data === 'object') {
    const msg = (data as { message?: unknown }).message
    if (typeof msg === 'string' && msg.trim()) return msg.trim()
  }

  const raw = (e instanceof Error ? e.message : typeof e === 'string' ? e : '').trim()
  // A bare status line ("Request failed with status 400") or a low-level transport failure
  // ("Failed to fetch") is noise — fall back to the caller's friendly, context-specific default.
  if (!raw || /^Request failed with status/i.test(raw) || isTransportError(raw)) return fallback
  // Strip "Error invoking remote method 'channel': " and the leading "<ErrorClass>: " token.
  const m = raw.match(/Error invoking remote method '[^']*':\s*(?:[A-Za-z][\w.]*:\s*)?([\s\S]*)$/)
  return (m?.[1] ?? raw).trim() || fallback
}
