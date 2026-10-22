import type { Review } from './window'
import { basename, resolve } from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'
import { app } from 'electron'
import { browserPath, pageFor, sharedAnalysisQuery } from '../../cli/src/page'
import { defaultPage } from './pages'
import { setup, show } from './window'

const HELP = `Usage: yadv [target] [options]

Reviews local git changes - or any GitHub pull request - in a desktop window. Run it inside a
git repository. While a window is open, running yadv again switches it to the new repository
and target. ⌘K in the window switches between worktrees, Rift workspaces and targets.

Target: the uncommitted changes, or the current branch when there are none. Otherwise any target
pulls.review takes (run \`pulls.review --help\`).

Options:
  --worktree      open the uncommitted changes against HEAD
  --from <login>  with a GitHub pull request, load the AI analysis <login> shared on it
  -h, --help
`

/** Marks the end of a launch's output: `bin/yadv.mjs` stops relaying and returns the terminal. */
const DONE = '\0yadv:done'

// `bin/yadv.mjs` stops reading once the launch is done; later writes must not crash the app.
process.stdout.on('error', () => {})
process.stderr.on('error', () => {})

function finish(message: string, code = 0): void {
  const stream = code ? process.stderr : process.stdout
  stream.write(`${message}\n`)
  process.stdout.write(`${DONE}${code}\n`)
}

async function resolveReview(argv: string[], cwd: string): Promise<Review | undefined> {
  const { values: flags, positionals } = parseArgs({
    args: argv,
    options: {
      worktree: { type: 'boolean' },
      from: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
  })
  if (flags.help) {
    finish(HELP.trimEnd())
    return undefined
  }
  if (!positionals[0] && !flags.worktree && flags.from === undefined)
    return { cwd, page: await defaultPage(cwd) }
  const page = browserPath(await pageFor(cwd, positionals[0], !!flags.worktree)) + sharedAnalysisQuery(positionals[0], flags.from)
  return { cwd, page }
}

async function main(): Promise<void> {
  // `electron [switches] <app dir> ...args`
  const argv = process.argv.slice(process.argv.findIndex(arg => resolve(arg) === app.getAppPath()) + 1)
  const review = await resolveReview(argv, process.cwd())
  if (!review) {
    app.exit(0)
    return
  }
  if (!app.requestSingleInstanceLock(review)) {
    finish(`yadv: opened ${review.page} of ${basename(review.cwd)} in the running window`)
    app.exit(0)
    return
  }

  app.on('second-instance', (_event, _argv, _cwd, data) => {
    show(data as Review)
  })
  app.on('window-all-closed', () => app.quit())

  await app.whenReady()
  setup()
  await show(review)
  finish(`yadv: reviewing ${review.page} of ${basename(review.cwd)}`)
}

main().catch((error) => {
  finish(`yadv: ${error instanceof Error ? error.message : error}`, 1)
  app.exit(1)
})
