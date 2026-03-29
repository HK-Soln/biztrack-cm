const { spawn } = require('child_process')
const path = require('path')

const cwd = path.resolve(__dirname, '..')

const processes = []

const run = (label, command) => {
  const child = spawn(command, {
    cwd,
    shell: true,
    stdio: 'inherit',
    env: process.env,
  })

  child.on('exit', (code) => {
    if (code && code !== 0) {
      // Exit everything if one process dies
      processes.forEach((proc) => proc && proc.kill && proc.kill())
      process.exit(code)
    }
  })

  child.on('error', (err) => {
    console.error(`[${label}] failed to start:`, err.message)
    processes.forEach((proc) => proc && proc.kill && proc.kill())
    process.exit(1)
  })

  processes.push(child)
}

run('tsc', 'tsc -p tsconfig.electron.json -w')
run('next', 'next dev -p 3000')
run('electron', 'wait-on dist/electron/main.js http://localhost:3000 && electron .')

process.on('SIGINT', () => {
  processes.forEach((proc) => proc && proc.kill && proc.kill())
  process.exit(0)
})
