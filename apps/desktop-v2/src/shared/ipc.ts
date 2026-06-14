// Single source of truth for the renderer↔main IPC contract. Imported by main
// (handlers), preload (bridge), and renderer (typed window.api). NO data or token
// channels are exposed beyond these typed, high-level domain calls.

export const IPC = {
  skeletonCheck: 'skeleton:check',
  skeletonHealth: 'skeleton:health',
  themeSet: 'theme:set',
} as const

export interface SkeletonCheckDTO {
  value: string
  checkedAt: string
}

export interface SkeletonHealthDTO {
  ok: boolean
  productCount: number
  skeletonValue: string | null
  source: 'local-sqlite'
}

/** The shape exposed on `window.api` by the preload bridge. */
export interface BridgeApi {
  skeleton: {
    getCheck: () => Promise<SkeletonCheckDTO | null>
    getHealth: () => Promise<SkeletonHealthDTO>
  }
  theme: {
    set: (theme: 'light' | 'dark' | 'system') => void
  }
}
