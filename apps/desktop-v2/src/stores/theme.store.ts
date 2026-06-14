'use client'

import { create } from 'zustand'

/**
 * Theme store — owns the two axes that next-themes does NOT manage:
 *   • palette: which colour theme is active (Deep Ink Blue by default)
 *   • chrome:  how the app frame (sidebar / top bar) is painted
 *
 * Light / dark / system is owned by next-themes (`useTheme`). Both axes are
 * applied as attributes on <html> so the CSS variable blocks in globals.css
 * resolve, and persisted to localStorage. The matching no-flash script in
 * app/layout.tsx reads the same keys before paint to avoid a theme flash.
 */

export type ThemePalette = 'a' | 'b' | 'c' | 'd'
export type ThemeChrome = 'neutral' | 'brand'

export const PALETTE_STORAGE_KEY = 'biztrack.theme.palette'
export const CHROME_STORAGE_KEY = 'biztrack.theme.chrome'

export const DEFAULT_PALETTE: ThemePalette = 'a'
export const DEFAULT_CHROME: ThemeChrome = 'neutral'

const PALETTES: ThemePalette[] = ['a', 'b', 'c', 'd']
const CHROMES: ThemeChrome[] = ['neutral', 'brand']

export type ThemePaletteMeta = {
  id: ThemePalette
  name: string
  description: string
  /** Representative swatches [brand, surface, canvas] for the picker. */
  swatches: [string, string, string]
}

/** Display metadata for the Appearance picker (light-mode swatches). */
export const PALETTE_META: ThemePaletteMeta[] = [
  { id: 'a', name: 'Deep Ink Blue', description: 'Calm, trustworthy — the BizTrack default.', swatches: ['#16467A', '#FFFFFF', '#F4F5F7'] },
  { id: 'b', name: 'Slate & Teal', description: 'Cool and focused, with a teal accent.', swatches: ['#0F5C5C', '#FFFFFF', '#F3F5F5'] },
  { id: 'c', name: 'Graphite', description: 'Monochrome and understated.', swatches: ['#33332F', '#FFFFFF', '#F5F5F4'] },
  { id: 'd', name: 'Royal Indigo', description: 'Refined with a violet signature.', swatches: ['#4A3F94', '#FFFFFF', '#F5F5F8'] },
]

function isPalette(value: unknown): value is ThemePalette {
  return typeof value === 'string' && (PALETTES as string[]).includes(value)
}

function isChrome(value: unknown): value is ThemeChrome {
  return typeof value === 'string' && (CHROMES as string[]).includes(value)
}

function readStored<T>(key: string, guard: (v: unknown) => v is T, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  const stored = window.localStorage.getItem(key)
  return guard(stored) ? stored : fallback
}

function applyToDocument(palette: ThemePalette, chrome: ThemeChrome) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.setAttribute('data-palette', palette)
  root.setAttribute('data-chrome', chrome)
}

type ThemeStoreState = {
  hydrated: boolean
  palette: ThemePalette
  chrome: ThemeChrome
  /** Read persisted values and apply them. Call once on mount. */
  hydrate: () => void
  setPalette: (palette: ThemePalette) => void
  setChrome: (chrome: ThemeChrome) => void
}

export const useThemeStore = create<ThemeStoreState>((set, get) => ({
  hydrated: false,
  palette: DEFAULT_PALETTE,
  chrome: DEFAULT_CHROME,

  hydrate: () => {
    const palette = readStored(PALETTE_STORAGE_KEY, isPalette, DEFAULT_PALETTE)
    const chrome = readStored(CHROME_STORAGE_KEY, isChrome, DEFAULT_CHROME)
    applyToDocument(palette, chrome)
    set({ palette, chrome, hydrated: true })
  },

  setPalette: (palette) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(PALETTE_STORAGE_KEY, palette)
    }
    applyToDocument(palette, get().chrome)
    set({ palette })
  },

  setChrome: (chrome) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(CHROME_STORAGE_KEY, chrome)
    }
    applyToDocument(get().palette, chrome)
    set({ chrome })
  },
}))
