import type { PageEntry } from './ipc'
import { browserPath, pageFor } from '../../cli/src/page'
import { changeCount } from './git'

/**
 * What a bare `yadv` (or a palette switch) opens: the uncommitted changes, unless there are none -
 * then the CLI's own default, the current branch against the default branch.
 */
export async function defaultPage(cwd: string): Promise<string> {
  if (await changeCount(cwd).catch(() => 0))
    return '/worktree'
  return browserPath(await pageFor(cwd, undefined, false))
}

/** The palette's rows for the repository in the window. */
export async function pageEntries(cwd: string): Promise<PageEntry[]> {
  const branch = browserPath(await pageFor(cwd, undefined, false).catch(() => '/'))
  return [
    { page: '/worktree', title: 'Uncommitted changes', icon: 'i-ph:pencil-simple-line-duotone' },
    ...branch === '/' ? [] : [{ page: branch, title: `${describePage(branch)} against the default branch`, icon: 'i-ph:git-branch-duotone' }],
    { page: '/', title: 'Compare refs…', icon: 'i-ph:arrows-left-right-duotone' },
  ]
}

/** A page path as the title strip shows it: `/branch/feat` -> `feat`. */
export function describePage(page: string): string {
  const path = decodeURIComponent(page.replace(/[?#].*$/, ''))
  const [, kind = '', ...rest] = path.split('/')
  const target = rest.join('/')
  switch (kind) {
    case '':
      return 'Compare refs'
    case 'worktree':
      return 'Uncommitted changes'
    case 'commit':
      return `Commit ${target.slice(0, 12)}`
    case 'gh': {
      const [owner, repo, ...more] = rest
      const name = `${owner}/${repo}`
      if (more[0] === 'compare' || more[0] === 'commit')
        return `${name} ${more.slice(1).join('/')}`
      return more[0] ? `${name}#${more[0]}` : name
    }
    default:
      return target
  }
}
