#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import electron from 'electron'

// Relays the app's output until it reports the launch done (`DONE` in `src/main.ts`), then lets
// it run on detached, so the terminal is free again. A second `yadv` hands its arguments and
// directory to the running window and exits.
const DONE = '\0yadv:done'

// Set when yadv itself runs from inside an Electron app's terminal; it would start this one as plain Node.
const { ELECTRON_RUN_AS_NODE: _, ...env } = process.env

// The renamed bundle `pnpm build` makes (`scripts/bundle.mjs`), else plain Electron.
const bundle = fileURLToPath(new URL('../dist/yadv.app/Contents/MacOS/Electron', import.meta.url))

const child = spawn(existsSync(bundle) ? bundle : electron, [fileURLToPath(new URL('..', import.meta.url)), ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env,
  detached: true,
  stdio: ['ignore', 'pipe', 'pipe'],
})

let released = false
function release(code) {
  released = true
  child.stdout.destroy()
  child.stderr.destroy()
  child.unref()
  process.exitCode = code
}

let buffered = ''
child.stdout.on('data', (chunk) => {
  buffered += chunk
  const at = buffered.indexOf(DONE)
  if (at === -1)
    return
  process.stdout.write(buffered.slice(0, at))
  release(Number.parseInt(buffered.slice(at + DONE.length), 10) || 0)
})
child.stderr.pipe(process.stderr)
child.on('exit', (code) => {
  if (released)
    return
  process.stdout.write(buffered.replace(/\0yadv:done\d*\n?/, ''))
  process.exitCode = code ?? 1
})
