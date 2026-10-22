// Builds `dist/yadv.app`: Electron's own bundle, renamed, so the Dock, the app switcher and the
// menu bar say yadv instead of Electron. It still runs this checkout's code - `bin/yadv.mjs` hands
// it the package directory - so there's nothing to rebuild after a pull but `pnpm build`.
import { execFileSync } from 'node:child_process'
import { copyFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import electron from 'electron'

if (process.platform !== 'darwin')
  process.exit(0)

const source = dirname(dirname(dirname(electron)))
const target = fileURLToPath(new URL('../dist/yadv.app', import.meta.url))
const plist = join(target, 'Contents', 'Info.plist')

rmSync(target, { recursive: true, force: true })
// `-c` clones on APFS: instant, and no second copy of Electron on disk.
execFileSync('cp', ['-Rc', source, target])
for (const [key, value] of [['CFBundleName', 'yadv'], ['CFBundleDisplayName', 'yadv'], ['CFBundleIdentifier', 'dev.yadv.app']])
  execFileSync('plutil', ['-replace', key, '-string', value, plist])
copyFileSync(fileURLToPath(new URL('../assets/icon.icns', import.meta.url)), join(target, 'Contents', 'Resources', 'electron.icns'))
// Editing Info.plist breaks Electron's ad-hoc signature, and macOS won't run an invalid one.
execFileSync('codesign', ['--force', '--deep', '--sign', '-', target], { stdio: 'ignore' })
