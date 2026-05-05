const { cpSync, existsSync, mkdirSync, rmSync } = require('fs')
const { resolve } = require('path')

const projectRoot = resolve(__dirname, '..')
const distRoot = resolve(projectRoot, 'dist')
const sourceDir = resolve(distRoot, 'next')
const targetDir = resolve(distRoot, 'renderer')

if (!existsSync(sourceDir)) {
  throw new Error(`Next export output was not found at ${sourceDir}`)
}

mkdirSync(distRoot, { recursive: true })
rmSync(targetDir, { recursive: true, force: true })
cpSync(sourceDir, targetDir, { recursive: true })
