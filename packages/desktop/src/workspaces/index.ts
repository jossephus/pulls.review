import type { WorkspaceEntry, WorkspaceGroup } from '../ipc'
import type { WorkspaceSource } from './types'
import { realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { changeCount, head } from '../git'
import { gitWorktrees } from './git-worktrees'
import { rift } from './rift'

/**
 * Palette order, most general first. A checkout two sources both list shows under the later,
 * more specific one: every rift is also the main worktree of its own copy.
 */
export const sources: WorkspaceSource[] = [gitWorktrees, rift]

const canonical = (path: string): Promise<string> => realpath(path).catch(() => path)

/** Every source's workspaces for the repository at `root`, with what the palette shows of each. */
export async function listWorkspaces(root: string): Promise<WorkspaceGroup[]> {
  const current = await canonical(root)
  const listed = await Promise.all(sources.map(source => source.list(root).catch(() => [])))
  const seen = new Set<string>()
  const groups: WorkspaceGroup[] = []
  for (const [index, source] of [...sources.entries()].reverse()) {
    const workspaces: WorkspaceEntry[] = []
    for (const workspace of listed[index]!) {
      const path = await canonical(workspace.path)
      if (seen.has(path))
        continue
      seen.add(path)
      workspaces.push({ ...workspace, path, location: path.replace(homedir(), '~'), changes: 0, current: path === current })
    }
    await Promise.all(workspaces.map(async (entry) => {
      [entry.head, entry.changes] = await Promise.all([head(entry.path), changeCount(entry.path).catch(() => 0)])
    }))
    if (workspaces.length)
      groups.unshift({ id: source.id, title: source.title, icon: source.icon, workspaces })
  }
  return groups
}
