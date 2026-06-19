/**
 * Clean message from an error thrown across the Electron IPC bridge. Electron
 * wraps main-process errors as:
 *   "Error invoking remote method 'products:add-variant': Error: <real message>"
 * We only want the real message for the UI.
 */
export function errorMessage(e: unknown, fallback = 'Something went wrong.'): string {
  const raw = (e instanceof Error ? e.message : typeof e === 'string' ? e : '').trim()
  if (!raw) return fallback
  // Strip "Error invoking remote method 'channel': " and the leading "<ErrorClass>: " token.
  const m = raw.match(/Error invoking remote method '[^']*':\s*(?:[A-Za-z][\w.]*:\s*)?([\s\S]*)$/)
  return ((m?.[1] ?? raw).trim()) || fallback
}
