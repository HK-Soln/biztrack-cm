import { create } from 'zustand'
import { dataClient } from '@/lib/data-client'

// Drives the design-system token attributes on <html>:
//   data-theme   = light | dark   (resolved from mode: light | dark | system)
//   data-palette = a | b | c | d
//   data-chrome  = neutral | brand
// The CSS variable blocks in @biztrack/ui/styles.css resolve from these.

export type ThemeMode = 'light' | 'dark' | 'system'
export type ThemePalette = 'a' | 'b' | 'c' | 'd'
export type ThemeChrome = 'neutral' | 'brand'

const MODE_KEY = 'biztrack.theme.mode'
const PALETTE_KEY = 'biztrack.theme.palette'
const CHROME_KEY = 'biztrack.theme.chrome'

const MODES: ThemeMode[] = ['light', 'dark', 'system']
const PALETTES: ThemePalette[] = ['a', 'b', 'c', 'd']
const CHROMES: ThemeChrome[] = ['neutral', 'brand']

export const PALETTE_META: Array<{ id: ThemePalette; name: string; swatch: string }> = [
  { id: 'a', name: 'Ink Blue', swatch: '#16467A' },
  { id: 'b', name: 'Slate Teal', swatch: '#0F5C5C' },
  { id: 'c', name: 'Graphite', swatch: '#33332F' },
  { id: 'd', name: 'Indigo', swatch: '#4A3F94' },
]

function read<T extends string>(key: string, allowed: T[], fallback: T): T {
  if (typeof window === 'undefined') return fallback
  const v = window.localStorage.getItem(key)
  return v && (allowed as string[]).includes(v) ? (v as T) : fallback
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

function apply(mode: ThemeMode, palette: ThemePalette, chrome: ThemeChrome) {
  if (typeof document === 'undefined') return
  const dark = mode === 'dark' || (mode === 'system' && systemPrefersDark())
  const root = document.documentElement
  root.setAttribute('data-theme', dark ? 'dark' : 'light')
  root.setAttribute('data-palette', palette)
  root.setAttribute('data-chrome', chrome)
}

interface ThemeState {
  mode: ThemeMode
  palette: ThemePalette
  chrome: ThemeChrome
  resolvedDark: boolean
  init: () => void
  setMode: (mode: ThemeMode) => void
  setPalette: (palette: ThemePalette) => void
  setChrome: (chrome: ThemeChrome) => void
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: 'system',
  palette: 'a',
  chrome: 'neutral',
  resolvedDark: false,

  init: () => {
    const mode = read(MODE_KEY, MODES, 'system')
    const palette = read(PALETTE_KEY, PALETTES, 'a')
    const chrome = read(CHROME_KEY, CHROMES, 'neutral')
    apply(mode, palette, chrome)
    set({ mode, palette, chrome, resolvedDark: document.documentElement.getAttribute('data-theme') === 'dark' })
    if (typeof window !== 'undefined') {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (get().mode === 'system') {
          apply('system', get().palette, get().chrome)
          set({ resolvedDark: systemPrefersDark() })
        }
      })
    }
  },

  setMode: (mode) => {
    window.localStorage.setItem(MODE_KEY, mode)
    apply(mode, get().palette, get().chrome)
    set({ mode, resolvedDark: document.documentElement.getAttribute('data-theme') === 'dark' })
    dataClient.theme.set(mode)
  },

  setPalette: (palette) => {
    window.localStorage.setItem(PALETTE_KEY, palette)
    apply(get().mode, palette, get().chrome)
    set({ palette })
  },

  setChrome: (chrome) => {
    window.localStorage.setItem(CHROME_KEY, chrome)
    apply(get().mode, get().palette, chrome)
    set({ chrome })
  },
}))
