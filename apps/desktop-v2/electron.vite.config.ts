import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Dev-only CSP loosening (serve mode). The packaged Electron build keeps the strict
// policy because the MAIN process makes API calls + opens the realtime socket — the
// renderer never talks to the network directly there. But in the browser / cloud build
// the renderer DOES call apps/api and open a websocket, and Vite's HMR injects inline
// scripts, so in dev we allow:
//   - img-src   → localhost (API-served upload images)
//   - connect-src → localhost http + ws/wss (API fetch + realtime socket)
//   - script-src  → 'unsafe-inline' (no-flash theme script + Vite HMR client)
const devCspPlugin = {
  name: 'biztrack-dev-csp',
  apply: 'serve' as const,
  transformIndexHtml(html: string) {
    return html
      .replace(
        "img-src 'self' data: https:",
        "img-src 'self' data: https: http://localhost:* http://127.0.0.1:*",
      )
      .replace(
        "connect-src 'self'",
        "connect-src 'self' http://localhost:* https://localhost:* ws://localhost:* wss://localhost:* http://127.0.0.1:* ws://127.0.0.1:*",
      )
      .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
  },
}

// electron-vite builds three targets: main (Electron main process), preload, and
// renderer (the React SPA). externalizeDepsPlugin keeps node/native deps
// (better-sqlite3, @biztrack/electron-core) external so they're required at runtime
// rather than bundled — essential for the native SQLite binary.
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    // Bake the API base URL into the packaged main-process bundle at BUILD time.
    // electron-vite does NOT inline process.env for the main process, so without this
    // the installed app reads process.env on the user's machine (unset) and falls back
    // to localhost. Set VITE_API_URL (or DESKTOP_API_URL) in the build env — see
    // desktop-v2-release.yml. src/main/config.ts reads exactly these two keys.
    define: {
      'process.env.DESKTOP_API_URL': JSON.stringify(process.env.DESKTOP_API_URL ?? ''),
      'process.env.VITE_API_URL': JSON.stringify(process.env.VITE_API_URL ?? ''),
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src'),
        '@shared': resolve(__dirname, 'src/shared'),
        '@biztrack/types': resolve(__dirname, '../../packages/types/src'),
        '@biztrack/utils': resolve(__dirname, '../../packages/utils/src'),
        '@biztrack/templates': resolve(__dirname, '../../packages/templates/src'),
        // Cloud HTTP client (browser flavor) — alias to source so the renderer bundles
        // it as ESM (the published dist is CJS, which Rollup can't named-import here).
        '@biztrack/http-client/browser': resolve(
          __dirname,
          '../../packages/http-client/src/browser.ts',
        ),
        '@biztrack/ui/styles.css': resolve(__dirname, '../../packages/ui/src/styles/biztrack.css'),
        '@biztrack/ui/biztrack': resolve(__dirname, '../../packages/ui/src/biztrack/index.ts'),
      },
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') },
      },
    },
    plugins: [react(), devCspPlugin],
  },
})
