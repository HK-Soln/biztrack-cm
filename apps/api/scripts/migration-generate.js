/* eslint-disable turbo/no-undeclared-env-vars -- dev-only tooling script: reads
   npm/OS vars (MIGRATION_NAME, npm_config_name, LOCALAPPDATA) that must NOT be
   declared in turbo.json (LOCALAPPDATA is per-machine and would break cache sharing). */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS dev tooling script
const { spawnSync } = require('child_process')

const args = process.argv.slice(2)
let nameArg
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i]
  if (arg === '--name' || arg === '-n') {
    nameArg = args[i + 1]
    i += 1
  }
}

const rawName =
  nameArg ||
  process.env.MIGRATION_NAME ||
  process.env.npm_config_name ||
  'auto'

const name = String(rawName).trim().replace(/[^a-zA-Z0-9-_]/g, '_') || 'auto'
const migrationPath = `src/database/migrations/${name}`

const result = spawnSync(
  'node',
  [
    '-r',
    'tsconfig-paths/register',
    './node_modules/typeorm/cli-ts-node-commonjs.js',
    'migration:generate',
    migrationPath,
    '-d',
    'src/database/data-source.ts',
  ],
  { stdio: 'inherit', shell: true },
)

process.exit(result.status ?? 1)
