// Native-app handoff (N7 layer 2b). When the BROWSER build is opened from a notification
// link (marked `?openapp=1`), try to hand off to the installed BizTrack desktop app for the
// same route via the biztrack:// custom protocol — and fall back to staying in the browser
// when the app isn't installed. Runs once on boot; a no-op in the Electron build (which is
// already the native app) and when there's no marker (normal browsing/bookmarks).

const SCHEME = 'biztrack'
const MARKER = 'openapp'

/** Attempt to open the installed desktop app for the current route, then continue in the
 *  browser regardless. Safe to call unconditionally — it self-gates. */
export function tryNativeHandoff(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  // Electron build exposes window.api — it IS the native app, so never bounce.
  if ((window as unknown as { api?: unknown }).api) return

  // The marker lives in the real query (before the hash); the route lives in the hash
  // (the app is a hash router), e.g. `https://app…/?openapp=1#/contacts/123`.
  const params = new URLSearchParams(window.location.search)
  if (params.get(MARKER) !== '1') return

  // Strip the marker so a refresh, bookmark, or in-app navigation never re-triggers handoff.
  params.delete(MARKER)
  const search = params.toString()
  window.history.replaceState(
    {},
    '',
    `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`,
  )

  // biztrack://<route> — the desktop app's protocol handler maps it back to the in-app route.
  const route = window.location.hash.replace(/^#\/?/, '')
  if (!route) return
  const target = `${SCHEME}://${route}`

  // A hidden iframe attempts the protocol without navigating the visible page away — if the
  // app is registered the OS opens it; if not, nothing happens and the browser stays put.
  try {
    const frame = document.createElement('iframe')
    frame.style.display = 'none'
    frame.src = target
    document.body.appendChild(frame)
    window.setTimeout(() => frame.remove(), 1500)
  } catch {
    // Best-effort — a blocked protocol attempt just leaves the user in the browser.
  }
}
