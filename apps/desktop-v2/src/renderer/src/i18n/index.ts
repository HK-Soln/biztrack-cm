import { create } from 'zustand'
import { catalogs, en, type MessageKey } from './messages'

export type Lang = 'en' | 'fr'

const LANG_KEY = 'biztrack.lang'

function initialLang(): Lang {
  if (typeof window === 'undefined') return 'fr'
  const stored = window.localStorage.getItem(LANG_KEY)
  if (stored === 'en' || stored === 'fr') return stored
  // Default to French — BizTrack's primary market (matches the API's fr fallback).
  return navigator.language?.toLowerCase().startsWith('en') ? 'en' : 'fr'
}

interface LangState {
  lang: Lang
  setLang: (lang: Lang) => void
}

export const useLangStore = create<LangState>((set) => ({
  lang: initialLang(),
  setLang: (lang) => {
    if (typeof window !== 'undefined') window.localStorage.setItem(LANG_KEY, lang)
    document.documentElement.setAttribute('lang', lang)
    set({ lang })
  },
}))

/** Translation hook. Re-renders consumers when the language changes. */
export function useT(): (key: MessageKey) => string {
  const lang = useLangStore((s) => s.lang)
  return (key) => catalogs[lang][key] ?? en[key] ?? key
}
