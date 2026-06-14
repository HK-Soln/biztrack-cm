/**
 * Dev orchestrator for desktop-v2:
 *   1. build @biztrack/electron-core (the BFF + electron main import its dist)
 *   2. seed the dev SQLite DB
 *   3. run `next dev` (SSR + BFF), watch-compile the electron main, launch Electron
 *
 * Electron loads the external `next dev` server (HMR preserved); the in-process
 * Next server (next-server.ts) is production-only.
 */
const { spawn, spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const cwd = path.resolve(__dirname, '..')
const RENDERER_PORT = process.env.DESKTOP_RENDERER_PORT || '3020'
const RENDERER_URL = process.env.DESKTOP_RENDERER_URL || `http://localhost:${RENDERER_PORT}`

process.env.NODE_ENV = 'development'
process.env.DESKTOP_RENDERER_URL = RENDERER_URL
process.env.DESKTOP_DB_PATH =
  process.env.DESKTOP_DB_PATH || path.join(cwd, 'biztrack-v2-dev.db')

const tscBin = path.join(cwd, 'node_modules', '.bin', process.platform === 'win32' ? 'tsc.cmd' : 'tsc')

function step(label, cmd, args) {
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit', env: process.env, shell: true })
  if (result.status !== 0) {
    console.error(`[${label}] failed`)
    process.exit(result.status || 1)
  }
}

// 1. Build electron-core, 2. seed DB, generate build-config, clean electron output.
step('electron-core', tscBin, ['-p', path.resolve(cwd, '../../packages/electron-core/tsconfig.json')])
step('seed', 'node', ['scripts/seed-dev-db.js'])
require('./generate-build-config')
fs.rmSync(path.join(cwd, 'dist', 'electron'), { recursive: true, force: true })

const processes = []
const run = (label, command) => {
  const child = spawn(command, { cwd, shell: true, stdio: 'inherit', env: process.env })
  child.on('exit', (code) => {
    if (code && code !== 0) {
      processes.forEach((p) => p && p.kill && p.kill())
      process.exit(code)
    }
  })
  child.on('error', (err) => {
    console.error(`[${label}] failed to start:`, err.message)
    processes.forEach((p) => p && p.kill && p.kill())
    process.exit(1)
  })
  processes.push(child)
}

run('tsc', 'tsc -p tsconfig.electron.json -w')
run('next', `next dev -p ${RENDERER_PORT}`)
run('electron', `wait-on dist/electron/main.js dist/electron/preload.js ${RENDERER_URL} && electron .`)

process.on('SIGINT', () => {
  processes.forEach((p) => p && p.kill && p.kill())
  process.exit(0)
})
