import { defineConfig } from 'vitest/config'

// Main-process (Node) tests for the desktop app. They exercise the real local
// SQLite layer via @biztrack/electron-core's in-memory test harness, whose native
// better-sqlite3 module is built for Electron's ABI — so this suite is launched
// under `electron` as a Node runtime (see the `test` script in package.json).
// Renderer/JSDOM tests are out of scope here and are not matched by `include`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/main/**/*.test.ts'],
    pool: 'forks',
    fileParallelism: false,
  },
})
