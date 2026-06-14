// Reads the resolved header CSS variables and pushes them to main so the native
// Windows caption buttons blend with the top bar. The header is `bg-card` /
// `text-foreground`, so we mirror --card / --foreground.

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
  if (typeof window === 'undefined' || !window.api?.window) return
  const styles = getComputedStyle(document.documentElement)
  const color = readVarAsHex(styles, '--card')
  const symbolColor = readVarAsHex(styles, '--foreground')
  if (color && symbolColor) {
    window.api.window.setTitleBarOverlay({ color, symbolColor })
  }
}
