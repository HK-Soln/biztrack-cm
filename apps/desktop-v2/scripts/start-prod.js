/**
 * Launches the packaged-style production app locally: forces production mode and
 * runs Electron, which boots the in-process Next standalone server (next-server.ts)
 * and loads it. Requires `pnpm build` first.
 */
const { spawn } = require('child_process')
const path = require('path')

const cwd = path.resolve(__dirname, '..')
const env = { ...process.env, NODE_ENV: 'production', DESKTOP_FORCE_PRODUCTION: '1' }

const child = spawn('electron', ['.'], { cwd, shell: true, stdio: 'inherit', env })
child.on('exit', (code) => process.exit(code || 0))
