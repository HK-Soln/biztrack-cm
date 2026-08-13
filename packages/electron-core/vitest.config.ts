import { defineConfig } from 'vitest/config'

// electron-core's tests exercise the real better-sqlite3 native module. That binary
// is compiled against Electron's ABI (see apps/desktop-v2/scripts/rebuild-sqlite.js),
// so the tests are launched under `electron` as a Node runtime — see the `test`
// script in package.json. `fileParallelism: false` runs every test file in one
// worker so the single native module is loaded once.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    pool: 'forks',
    fileParallelism: false,
  },
})
