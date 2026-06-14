import { create } from 'zustand'

// Owns all three theme axes in a pure-SPA renderer (no next-themes):
//   • mode:    light | dark | system  -> toggles the `dark` class
//   • palette: a | b | c | d          -> data-palette attribute
//   • chrome:  neutral | brand        -> data-chrome attribute
// Applied to <html> so the CSS variable blocks in globals.css resolve, and
// persisted to localStorage.

export type ThemeMode = 'light' | 'dark' | 'system'
export type ThemePalette = 'a' | 'b' | 'c' | 'd'
export type ThemeChrome = 'neutral' | 'brand'

const MODE_KEY = 'biztrack.theme.mode'
const PALETTE_KEY = 'biztrack.theme.palette'
const CHROME_KEY = 'biztrack.theme.chrome'

const PALETTES: ThemePalette[] = ['a', 'b', 'c', 'd']
const CHROMES: ThemeChrome[] = ['neutral', 'brand']
const MODES: ThemeMode[] = ['light', 'dark', 'system']

export const PALETTE_META: Array<{ id: ThemePalette; name: string; swatch: string }> = [
  { id: 'a', name: 'Deep Ink Blue', swatch: '#16467A' },
  { id: 'b', name: 'Slate & Teal', swatch: '#0F5C5C' },
  { id: 'c', name: 'Graphite', swatch: '#33332F' },
  { id: 'd', name: 'Royal Indigo', swatch: '#4A3F94' },
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
  const root = document.documentElement
  const dark = mode === 'dark' || (mode === 'system' && systemPrefersDark())
  root.classList.toggle('dark', dark)
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
    set({ mode, palette, chrome, resolvedDark: document.documentElement.classList.contains('dark') })

    // React to OS theme changes while in `system` mode.
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
    set({ mode, resolvedDark: document.documentElement.classList.contains('dark') })
    window.api?.theme?.set?.(mode)
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
