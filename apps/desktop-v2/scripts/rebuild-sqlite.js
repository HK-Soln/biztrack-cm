/**
 * Rebuilds better-sqlite3 for the installed Electron ABI so the native binary loads
 * inside Electron's Node runtime. Targets only better-sqlite3 to avoid false
 * failures on other native packages.
 */
const path = require('path')
const { rebuild } = require('@electron/rebuild')

const electronPkg = require(path.resolve(__dirname, '../node_modules/electron/package.json'))

rebuild({
  buildPath: path.resolve(__dirname, '..'),
  electronVersion: electronPkg.version,
  force: true,
  onlyModules: ['better-sqlite3'],
})
  .then(() => {
    console.log(`✔ better-sqlite3 rebuilt for Electron ${electronPkg.version}`)
    process.exit(0)
  })
  .catch((err) => {
    console.error('✗ Rebuild failed:', err?.message ?? err)
    process.exit(1)
  })
