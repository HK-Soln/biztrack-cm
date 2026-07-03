import { resolve } from 'path'
import { createHash } from 'crypto'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Standalone WEB build of the desktop-v2 renderer (the cloud app deployed to Vercel).
// The Electron build (electron.vite.config.ts) ships the same renderer inside Electron;
// here we emit a plain static SPA. The renderer already branches on `window.api`
// (Electron IPC) vs the cloud HTTP client, so no Electron/native code reaches this bundle.

// The browser talks to the API directly (unlike Electron, where the main process does),
// so derive the API origin from VITE_API_URL to open up the production CSP.
function apiOrigins() {
  const raw = process.env.VITE_API_URL?.trim() || 'http://localhost:3001/api/v1'
  try {
    const u = new URL(raw)
    return { http: u.origin, ws: `${u.protocol === 'https:' ? 'wss' : 'ws'}://${u.host}` }
  } catch {
    return { http: '', ws: '' }
  }
}

// Production CSP for the web build. connect-src must include the API origin + websocket
// (realtime). The inline no-flash theme script in index.html is allowed via its SHA-256
// hash rather than 'unsafe-inline', so we don't open the door to injected inline scripts.
function webCspPlugin() {
  return {
    name: 'biztrack-web-csp',
    apply: 'build' as const,
    transformIndexHtml(html: string) {
      const { http, ws } = apiOrigins()
      const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)].map(
        (m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`,
      )
      const csp = [
        "default-src 'self'",
        `script-src 'self' ${hashes.join(' ')}`.trim(),
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        'font-src https://fonts.gstatic.com',
        "img-src 'self' data: https:",
        `connect-src 'self' ${http} ${ws}`.trim(),
      ].join('; ')
      return html.replace(
        /<meta\s+http-equiv="Content-Security-Policy"[^>]*\/?>/,
        `<meta http-equiv="Content-Security-Policy" content="${csp}" />`,
      )
    },
  }
}

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
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
  plugins: [react(), webCspPlugin()],
})
