/// <reference types="vite/client" />
declare module '*.css'

interface ImportMetaEnv {
  /** Base URL of apps/api for the cloud/browser build (includes /api/v1). */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
