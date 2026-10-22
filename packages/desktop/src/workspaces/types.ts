/** A checkout yadv can review. */
export interface Workspace {
  path: string
  name: string
}

/**
 * One kind of related checkout - git worktrees, Rift workspaces. Adding a kind is one source in
 * this directory, registered in `index.ts`. A source that doesn't apply to the repository (the
 * tool isn't installed, the repository doesn't use it) returns none rather than throwing.
 */
export interface WorkspaceSource {
  id: string
  title: string
  /** An Iconify class for the palette's group heading. */
  icon: string
  /** The workspaces related to the repository at `root`, its own checkout included if it's one. */
  list: (root: string) => Promise<Workspace[]>
}
