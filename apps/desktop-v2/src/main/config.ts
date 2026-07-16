import { resolveDesktopConfig } from '../shared/config'

// Main-process configuration — the single place the main process reads env. VITE_API_URL,
// VITE_STOREFRONT_DOMAIN and NODE_ENV are baked at BUILD time by electron-vite (see the `define` in
// electron.vite.config.ts), so they must be read as direct `process.env.<KEY>` member accesses
// here for the replacement to apply. DESKTOP_DB_PATH + ELECTRON_RENDERER_URL are read at runtime
// (dev). Both required keys must be present at build time or resolveDesktopConfig throws and the
// app refuses to start. See src/shared/config.ts.
export const config = resolveDesktopConfig({
  apiUrl: process.env.VITE_API_URL,
  storeRootDomain: process.env.VITE_STOREFRONT_DOMAIN,
  dbPath: process.env.DESKTOP_DB_PATH,
  rendererDevUrl: process.env.ELECTRON_RENDERER_URL,
  nodeEnv: process.env.NODE_ENV,
})
