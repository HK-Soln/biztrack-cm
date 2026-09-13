/**
 * Copy text to the clipboard, returning whether it actually succeeded. navigator.clipboard can silently
 * reject in the Electron renderer (no user-gesture / non-secure context), so fall back to a hidden
 * textarea + execCommand. Callers should only show a "Copied" confirmation when this resolves true.
 */
export async function copyText(text: string): Promise<boolean> {
  // Electron build: the main process writes the OS clipboard reliably (no gesture/secure-context rules).
  const api = (window as unknown as { api?: { clipboard?: { write?: (t: string) => Promise<boolean> } } })
    .api
  if (api?.clipboard?.write) {
    try {
      if (await api.clipboard.write(text)) return true
    } catch {
      /* fall through */
    }
  }
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    /* fall through to the execCommand path */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}
