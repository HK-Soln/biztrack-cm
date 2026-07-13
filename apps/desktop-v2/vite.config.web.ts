import { resolve } from 'path'
import { createHash } from 'crypto'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Standalone WEB build of the desktop-v2 renderer (the cloud app deployed to Vercel).
// The Electron build (electron.vite.config.ts) ships the same renderer inside Electron;
// here we emit a plain static SPA. The renderer already branches on `window.api`
// (Electron IPC) vs the cloud HTTP client, so no Electron/native code reaches this bundle.

// Production CSP for the web build. connect-src must include the API origin + websocket
// (realtime). The inline no-flash theme script in index.html is allowed via its SHA-256
// hash rather than 'unsafe-inline', so we don't open the door to injected inline scripts.
function webCspPlugin(apiHttp: string, apiWs: string) {
  return {
    name: 'biztrack-web-csp',
    apply: 'build' as const,
    transformIndexHtml(html: string) {
      const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)].map(
        (m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`,
      )
      const csp = [
        "default-src 'self'",
        `script-src 'self' ${hashes.join(' ')}`.trim(),
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        'font-src https://fonts.gstatic.com',
        "img-src 'self' data: https:",
        `connect-src 'self' ${apiHttp} ${apiWs}`.trim(),
      ].join('; ')
      return html.replace(
        /<meta\s+http-equiv="Content-Security-Policy"[^>]*\/?>/,
        `<meta http-equiv="Content-Security-Policy" content="${csp}" />`,
      )
    },
  }
}

export default defineConfig(({ mode }) => {
  // Load .env / .env.local from the app root AND process.env (Vercel), process.env winning. The
  // cloud build is useless without the API URL — it would point every request at localhost AND
  // lock the CSP to localhost — so a missing required var fails the build here, loudly, with the
  // value it saw in the log. No localhost fallback.
  const env = loadEnv(mode, __dirname, 'VITE_')
  const apiUrl = env.VITE_API_URL?.trim()
  const storeDomain = env.VITE_STOREFRONT_DOMAIN?.trim()
  console.log(
    `[build:web] VITE_API_URL=${apiUrl || '(unset)'} VITE_STOREFRONT_DOMAIN=${storeDomain || '(unset)'}`,
  )
  const missing = [!apiUrl && 'VITE_API_URL', !storeDomain && 'VITE_STOREFRONT_DOMAIN'].filter(
    Boolean,
  )
  if (missing.length) {
    throw new Error(
      `[build:web] Missing required env: ${missing.join(', ')}. Set them in the Vercel project ` +
        'env for the environment you are deploying (Production/Preview) — then redeploy with build ' +
        'cache disabled — or in apps/desktop-v2/.env.local for a local build. No localhost fallback.',
    )
  }

  // The browser talks to the API directly (unlike Electron, where the main process does), so the
  // CSP connect-src must allow the API origin + its websocket (realtime).
  const u = new URL(apiUrl!)
  const apiHttp = u.origin
  const apiWs = `${u.protocol === 'https:' ? 'wss' : 'ws'}://${u.host}`

  return {
    root: resolve(__dirname, 'src/renderer'),
    // Read .env(.local) from the app root (same place electron-vite reads it), not src/renderer.
    envDir: resolve(__dirname),
    base: '/',
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src'),
        '@shared': resolve(__dirname, 'src/shared'),
        '@biztrack/types': resolve(__dirname, '../../packages/types/src'),
        '@biztrack/utils': resolve(__dirname, '../../packages/utils/src'),
        '@biztrack/templates': resolve(__dirname, '../../packages/templates/src'),
        '@biztrack/http-client/browser': resolve(
          __dirname,
          '../../packages/http-client/src/browser.ts',
        ),
        '@biztrack/ui/styles.css': resolve(__dirname, '../../packages/ui/src/styles/biztrack.css'),
        '@biztrack/ui/biztrack': resolve(__dirname, '../../packages/ui/src/biztrack/index.ts'),
      },
    },
    build: {
      outDir: resolve(__dirname, 'dist'),
      emptyOutDir: true,
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') },
      },
    },
    plugins: [react(), webCspPlugin(apiHttp, apiWs)],
  }
})
