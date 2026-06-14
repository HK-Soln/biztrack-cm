import type { NextConfig } from 'next'
import { resolve } from 'path'

// Unlike v1 (static export), v2 runs a real Next server (SSR + BFF route handlers).
// We boot it IN-PROCESS inside Electron main via `next({ dev:false })`, which uses
// the regular `.next` build — so we do NOT need `output: 'standalone'` (it also
// fails on Windows without symlink privileges). Packaging strategy is revisited in
// the packaging milestone; if we move to a forked `server.js`, standalone returns.
const nextConfig: NextConfig = {
  outputFileTracingRoot: resolve(__dirname, '../../'),
  // better-sqlite3 is a native module — keep it external so its .node binary is
  // required at runtime (and traced into the standalone bundle) rather than bundled.
  serverExternalPackages: ['better-sqlite3', '@biztrack/electron-core'],
  transpilePackages: ['@biztrack/types', '@biztrack/utils'],
  eslint: {
    // Lint is run explicitly in CI; don't fail `next build` on lint.
    ignoreDuringBuilds: true,
  },
}

export default nextConfig
