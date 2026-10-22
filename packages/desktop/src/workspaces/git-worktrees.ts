import type { Workspace, WorkspaceSource } from './types'
import { basename } from 'node:path'
import { output } from '../git'

/** `git worktree list`: the main checkout and every linked worktree with files on disk. */
export const gitWorktrees: WorkspaceSource = {
  id: 'git-worktrees',
  title: 'Worktrees',
  icon: 'i-ph:tree-structure-duotone',
  async list(root) {
    const porcelain = await output('git', ['worktree', 'list', '--porcelain'], root)
    const workspaces: Workspace[] = []
    for (const record of porcelain.split('\n\n')) {
      const fields = record.split('\n')
      const path = fields.find(field => field.startsWith('worktree '))?.slice('worktree '.length)
      if (path && !fields.some(field => field === 'bare' || field.startsWith('prunable')))
        workspaces.push({ path, name: basename(path) })
    }
    return workspaces
  },
}
