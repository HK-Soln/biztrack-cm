// Cross-platform sharing helpers.
// - Web build: navigator.share opens the OS share sheet when available.
// - Electron desktop: window.open(...) is routed to the system default app by the
//   main process's setWindowOpenHandler (shell.openExternal), so wa.me / mailto links
//   open WhatsApp / the mail client. Clipboard works on both.

export function canWebShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
}

/** Opens the native share sheet. Returns false if unavailable or dismissed. */
export async function webShare(data: {
  title?: string
  text?: string
  url: string
}): Promise<boolean> {
  if (!canWebShare()) return false
  try {
    await navigator.share(data)
    return true
  } catch {
    return false
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** Open an external URL (browser / WhatsApp / mail client). In Electron this is
 * intercepted by the window's open handler and routed to shell.openExternal. */
export function openExternal(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer')
}

/** A wa.me deep link that opens WhatsApp with the message pre-filled and editable — the owner
 * reviews and sends it themselves (never an auto-send). Pass a phone to target a specific
 * contact; without one, WhatsApp lets the owner pick the recipient. */
export function whatsappUrl(text: string, phone?: string | null): string {
  const digits = (phone ?? '').replace(/\D/g, '')
  const base = digits ? `https://wa.me/${digits}` : 'https://wa.me/'
  return `${base}?text=${encodeURIComponent(text)}`
}

export function mailtoUrl(subject: string, body: string): string {
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
