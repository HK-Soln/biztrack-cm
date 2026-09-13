'use client'

import { createContext, useContext, type ReactNode } from 'react'

/**
 * Draft-preview flag for the current request, provided by the (store) layout from the host
 * (`preview.<slug>`). Client components read it to fetch the draft catalogue and to block ordering
 * (add-to-cart, checkout) — preview is render-only.
 */
const PreviewContext = createContext(false)

export function PreviewProvider({ value, children }: { value: boolean; children: ReactNode }) {
  return <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>
}

export function usePreview(): boolean {
  return useContext(PreviewContext)
}
