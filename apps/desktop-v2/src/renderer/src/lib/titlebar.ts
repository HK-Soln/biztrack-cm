// Pushes the resolved top-bar symbol colour to main so the native Windows caption
// glyphs (− □ ×) contrast with the header. The overlay background is transparent
// (set in main), so only the symbol colour needs syncing — mirror --nav-fg-strong.
import { dataClient } from '@/lib/data-client'

export const isWindows =
  typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent)

function readVarAsHex(styles: CSSStyleDeclaration, name: string): string | null {
  const raw = styles.getPropertyValue(name).trim()
  if (!raw) return null
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw
  const fn = raw.match(/rgba?\(([^)]+)\)/i)
  const source = fn?.[1] ?? raw // "rgb(...)" body, or a bare "r g b" triplet
  const nums = source
    .split(/[\s,/]+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => Math.round(Number(part)))
  if (nums.length < 3 || nums.some((n) => Number.isNaN(n))) return null
  const hex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')
  return `#${hex(nums[0]!)}${hex(nums[1]!)}${hex(nums[2]!)}`
}

export function syncTitleBarOverlay(): void {
  if (typeof window === 'undefined') return
  const styles = getComputedStyle(document.documentElement)
  const symbolColor = readVarAsHex(styles, '--nav-fg-strong') ?? readVarAsHex(styles, '--text')
  if (symbolColor) {
    // Background stays transparent (main forces it); color is ignored there. In the
    // cloud build the adapter no-ops (no native window controls).
    dataClient.window.setTitleBarOverlay({ color: '#00000000', symbolColor })
  }
}
