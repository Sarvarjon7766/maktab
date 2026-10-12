import { cpSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const packageRoot = dirname(require.resolve('ezuikit-js'))
const source = resolve(packageRoot, 'ezuikit_static')
const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = resolve(frontendRoot, 'public', 'ezuikit_static')

mkdirSync(dirname(target), { recursive: true })
cpSync(source, target, { recursive: true })