import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Bundle the workspace @biztrack/* packages INTO the main/preload output instead of
// externalizing them. In a pnpm monorepo they're symlinked (node_modules/@biztrack/* →
// packages/*), and electron-builder crashes trying to pack files from those symlink
// targets ("… must be under apps/desktop-v2"). Bundling removes them from the packaged
// node_modules entirely. Native/third-party deps (better-sqlite3, etc.) stay external.
const BUNDLED_WORKSPACE_PKGS = [
  '@biztrack/electron-core',
  '@biztrack/http-client',
  '@biztrack/templates',
  '@biztrack/types',
  '@biztrack/utils',
  '@biztrack/logger',
]

// Resolve those workspace packages to their TS SOURCE (not the CJS dist, whose named exports
// Rollup can't statically bind — same reason the renderer aliases them). Bundling from source
// keeps the packaged app free of the symlinked node_modules that break electron-builder.
const workspaceSrc = (pkg: string, entry = 'src/index.ts') =>
  resolve(__dirname, `../../packages/${pkg}/${entry}`)
const MAIN_ALIASES = {
  '@biztrack/electron-core': workspaceSrc('electron-core'),
  '@biztrack/http-client': workspaceSrc('http-client'),
  '@biztrack/templates': workspaceSrc('templates'),
  '@biztrack/types': workspaceSrc('types'),
  '@biztrack/utils': workspaceSrc('utils'),
  '@biztrack/logger': workspaceSrc('logger'),
}

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
export default defineConfig(({ mode }) => {
  // Load .env / .env.local from the app root AND process.env (process.env wins) so both local dev
  // (.env.local) and CI/release (env) supply the required vars. There is NO localhost fallback —
  // the values are baked verbatim; if a required var is missing the packaged app fails to start
  // (resolveDesktopConfig throws at runtime). We only WARN here, not throw, so the plain
  // compile-verification build in CI (which doesn't set these) still passes — a real release is
  // guarded separately by the "Verify required build vars" step in desktop-v2-release.yml.
  const env = loadEnv(mode, __dirname, 'VITE_')
  const apiUrl = env.VITE_API_URL?.trim()
  const storeDomain = env.VITE_STOREFRONT_DOMAIN?.trim()
  const missing = [!apiUrl && 'VITE_API_URL', !storeDomain && 'VITE_STOREFRONT_DOMAIN'].filter(
    Boolean,
  )
  if (missing.length) {
    console.warn(
      `[electron build] WARNING: missing ${missing.join(', ')} — the packaged app will not start. ` +
        'Set them in apps/desktop-v2/.env.local (local) or the release environment (CI). ' +
        'Fine to ignore for a compile-only CI build.',
    )
  }
  return {
    main: {
      plugins: [externalizeDepsPlugin({ exclude: BUNDLED_WORKSPACE_PKGS })],
      resolve: { alias: MAIN_ALIASES },
      // Bake the required config into the packaged main-process bundle at BUILD time.
      // electron-vite does NOT inline process.env for the main process, so without this the
      // installed app reads process.env on the user's machine (unset) and can't start.
      // src/main/config.ts reads exactly these keys.
      define: {
        // Empty string (not undefined) when missing, so resolveDesktopConfig throws cleanly at
        // runtime instead of baking the literal `undefined`.
        'process.env.VITE_API_URL': JSON.stringify(apiUrl ?? ''),
        'process.env.VITE_STOREFRONT_DOMAIN': JSON.stringify(storeDomain ?? ''),
        // Deployment environment baked in (the packaged app can't read the user's process.env).
        // Gates DevTools: a `production` build refuses to open them. Falls back to the vite mode
        // ('production' for a release build, 'development' for dev serve) when NODE_ENV is unset.
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? mode),
      },
      build: {
        rollupOptions: {
          input: { index: resolve(__dirname, 'src/main/index.ts') },
        },
      },
    },
    preload: {
      plugins: [externalizeDepsPlugin({ exclude: BUNDLED_WORKSPACE_PKGS })],
      resolve: { alias: MAIN_ALIASES },
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
          '@biztrack/ui/styles.css': resolve(
            __dirname,
            '../../packages/ui/src/styles/biztrack.css',
          ),
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
  }
})
