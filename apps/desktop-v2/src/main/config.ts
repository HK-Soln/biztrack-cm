import { resolveDesktopConfig } from '../shared/config'

// Main-process configuration — the single place the main process reads env. VITE_API_URL is
// baked at BUILD time by electron-vite (see the `define` in electron.vite.config.ts), so it must
// be read as a direct `process.env.VITE_API_URL` member access here for the replacement to apply.
// DESKTOP_DB_PATH + ELECTRON_RENDERER_URL are read at runtime (dev). See src/shared/config.ts.
export const config = resolveDesktopConfig({
  apiUrl: process.env.VITE_API_URL,
  dbPath: process.env.DESKTOP_DB_PATH,
  rendererDevUrl: process.env.ELECTRON_RENDERER_URL,
})
