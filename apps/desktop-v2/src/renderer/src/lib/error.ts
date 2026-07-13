/**
 * Clean message from an error thrown either across the Electron IPC bridge (desktop) or by the
 * cloud HTTP client (browser build).
 *
 * - Cloud/HTTP errors (HttpError) carry the API envelope on `response.data` — the real message is
 *   `response.data.message`, not `e.message` (which is just "Request failed with status 400").
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
  // A bare axios/fetch status message is noise — fall back to the caller's friendly default.
  if (!raw || /^Request failed with status/i.test(raw)) return fallback
  // Strip "Error invoking remote method 'channel': " and the leading "<ErrorClass>: " token.
  const m = raw.match(/Error invoking remote method '[^']*':\s*(?:[A-Za-z][\w.]*:\s*)?([\s\S]*)$/)
  return (m?.[1] ?? raw).trim() || fallback
}
