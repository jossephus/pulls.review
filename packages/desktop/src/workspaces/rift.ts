import type { Workspace, WorkspaceSource } from './types'
import { basename } from 'node:path'
import { lines } from '../git'

/** Enough for any real tree; stops a registry that loops. */
const LIMIT = 500

/**
 * [Rift](https://github.com/anomalyco/rift) copy-on-write workspaces: every workspace in the tree
 * the repository belongs to, from its root down. `rift ancestors` and `rift list` print one path
 * per line, and fail outside a `rift init`-ed tree.
 */
export const rift: WorkspaceSource = {
  id: 'rift',
  title: 'Rifts',
  icon: 'i-ph:git-fork-duotone',
  async list(root) {
    const ancestors = await lines('rift', ['ancestors', root])
    const workspaces: Workspace[] = []
    const queue = [ancestors.at(-1) ?? root]
    while (queue.length && workspaces.length < LIMIT) {
      const path = queue.shift()!
      workspaces.push({ path, name: basename(path) })
      queue.push(...await lines('rift', ['list', path]))
    }
    return workspaces
  },
}
