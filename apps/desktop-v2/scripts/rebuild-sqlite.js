/**
 * Ensures better-sqlite3's native binary matches the installed Electron ABI so it loads
 * in Electron's main process.
 *
 * Why this is careful: on Windows a `.node` that a running Electron/Node process has
 * loaded cannot be unlinked (EPERM), so a naive force-rebuild fails on every install
 * whenever a dev app is open — and two apps' postinstalls racing on the same hoisted
 * module fail the same way. So this script:
 *   1. Skips when the binary is already stamped for the current Electron version.
 *   2. Serialises concurrent runs with a lockfile mutex.
 *   3. If a rebuild is blocked by a lock, the binary is — by definition — already loaded
 *      by a running Electron (hence built for this ABI), so it adopts it (writes the
 *      stamp) instead of failing the install.
 *
 * CI (any `CI` env var) is strict: it has no running apps, so a rebuild must actually
 * succeed — failures there exit non-zero.
 */
const fs = require('fs')
const os = require('os')
const path = require('path')

const APP_DIR = path.resolve(__dirname, '..')
const STRICT = !!process.env.CI
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function electronVersion() {
  return require(path.resolve(APP_DIR, 'node_modules/electron/package.json')).version
}

function resolveModuleDir() {
  try {
    return path.dirname(require.resolve('better-sqlite3/package.json', { paths: [APP_DIR] }))
  } catch {
    return null
  }
}

// Atomic mkdir mutex so concurrent `pnpm install` postinstalls (or two apps) don't
// rebuild the same shared module at once.
async function withLock(key, fn) {
  const lockDir = path.join(os.tmpdir(), `biztrack-rebuild-${key}.lock`)
  const deadline = Date.now() + 120_000
  for (;;) {
    try {
      fs.mkdirSync(lockDir)
      break
    } catch (e) {
      if (e.code !== 'EEXIST') throw e
      try {
        if (Date.now() - fs.statSync(lockDir).mtimeMs > 180_000) {
          fs.rmSync(lockDir, { recursive: true, force: true }) // steal a stale lock
          continue
        }
      } catch {
        /* lock vanished — retry acquire */
      }
      if (Date.now() > deadline) {
        console.warn('… rebuild lock wait timed out; proceeding')
        break
      }
      await sleep(500)
    }
  }
  try {
    return await fn()
  } finally {
    try {
      fs.rmSync(lockDir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
}

async function main() {
  const dir = resolveModuleDir()
  if (!dir) {
    console.log('• better-sqlite3 not installed yet — skipping rebuild')
    return 0
  }

  const ev = electronVersion()
  const releaseDir = path.join(dir, 'build', 'Release')
  const binary = path.join(releaseDir, 'better_sqlite3.node')
  const stampPath = path.join(releaseDir, '.electron-rebuild.json')
  const readStamp = () => {
    try {
      return JSON.parse(fs.readFileSync(stampPath, 'utf8'))
    } catch {
      return null
    }
  }
  const writeStamp = () => {
    try {
      fs.writeFileSync(stampPath, JSON.stringify({ electron: ev, at: new Date().toISOString() }))
    } catch {
      /* stamp is an optimisation; ignore write failures */
    }
  }
  const isCurrent = () => fs.existsSync(binary) && readStamp()?.electron === ev

  if (isCurrent()) {
    console.log(`✔ better-sqlite3 already built for Electron ${ev} — skipping`)
    return 0
  }

  return withLock('better-sqlite3', async () => {
    if (isCurrent()) {
      console.log(`✔ better-sqlite3 already built for Electron ${ev} — skipping`)
      return 0
    }

    const hadStamp = !!readStamp()
    const { rebuild } = require('@electron/rebuild')
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await rebuild({ buildPath: APP_DIR, electronVersion: ev, force: true, onlyModules: ['better-sqlite3'] })
        writeStamp()
        console.log(`✔ better-sqlite3 rebuilt for Electron ${ev}`)
        return 0
      } catch (err) {
        if (attempt < 2) {
          console.warn(`… rebuild attempt ${attempt} failed; retrying in 2s…`)
          await sleep(2000)
          continue
        }
        if (STRICT) {
          console.error('✗ Rebuild failed:', err?.message ?? err)
          return 1
        }
        if (fs.existsSync(binary)) {
          // The binary couldn't be replaced because a running Electron has it loaded —
          // which means it's already built for this ABI. Adopt it so installs don't fail.
          if (!hadStamp) {
            writeStamp()
            console.log(`✔ Kept the better-sqlite3 binary already loaded by a running app (Electron ${ev}).`)
          } else {
            console.warn('⚠ Could not rebuild better-sqlite3 (file locked by a running app). Kept existing binary.')
            console.warn('  If Electron fails to load it after an upgrade, close all app windows and run:')
            console.warn('    pnpm -C apps/desktop-v2 exec node scripts/rebuild-sqlite.js')
          }
          return 0
        }
        console.error('✗ Rebuild failed and no binary is present:', err?.message ?? err)
        return 1
      }
    }
    return 1
  })
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('✗ Rebuild failed:', err?.message ?? err)
    process.exit(STRICT ? 1 : 0)
  })
