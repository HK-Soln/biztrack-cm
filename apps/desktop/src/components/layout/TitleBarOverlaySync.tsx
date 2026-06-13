'use client'

import { useEffect } from 'react'
import { useTheme } from 'next-themes'
import { ipc } from '@/services/ipc.bridge'
import { useThemeStore } from '@/stores/theme.store'

/**
 * Keeps the native window controls (− □ ×) painted to match whatever sits at
 * the top of the current shell, since Windows renders them as an overlay over
 * the web content:
 *   • app  — the coloured top band (`--top-bg` / `--top-fg-strong`)
 *   • auth — the plain page canvas (`--background` / `--foreground`), because
 *            unauthenticated screens have no top bar.
 * Each shell renders this with its variant; it re-sends whenever palette,
 * chrome or light/dark changes.
 */

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

export function TitleBarOverlaySync({ variant }: { variant: 'app' | 'auth' }) {
  const { resolvedTheme } = useTheme()
  const palette = useThemeStore((state) => state.palette)
  const chrome = useThemeStore((state) => state.chrome)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const id = window.requestAnimationFrame(() => {
      const styles = getComputedStyle(document.documentElement)
      const color = readVarAsHex(styles, variant === 'auth' ? '--background' : '--top-bg')
      const symbolColor = readVarAsHex(styles, variant === 'auth' ? '--foreground' : '--top-fg-strong')
      if (color && symbolColor) {
        ipc.theme.setTitleBarOverlay?.({ color, symbolColor })
      }
    })
    return () => window.cancelAnimationFrame(id)
  }, [variant, resolvedTheme, palette, chrome])

  return null
}
