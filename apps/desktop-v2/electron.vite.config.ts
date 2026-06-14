import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// electron-vite builds three targets: main (Electron main process), preload, and
// renderer (the React SPA). externalizeDepsPlugin keeps node/native deps
// (better-sqlite3, @biztrack/electron-core) external so they're required at runtime
// rather than bundled — essential for the native SQLite binary.
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
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
        '@biztrack/ui/styles.css': resolve(__dirname, '../../packages/ui/src/styles/biztrack.css'),
        '@biztrack/ui/biztrack': resolve(__dirname, '../../packages/ui/src/biztrack/index.ts'),
      },
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') },
      },
    },
    plugins: [react()],
  },
})
