/** What the window's own UI (`src/chrome`) and the main process say to each other. */

/** What the window shows: drawn in the title strip. */
export interface WindowState {
  repo: string
  /** The review's page path, e.g. `/worktree`. */
  page: string
  /** The page as the strip names it, e.g. `Uncommitted changes`. */
  label: string
  /** Follows the review page's own light/dark switch. */
  dark: boolean
}

/** A review target for the current repository, one palette row. */
export interface PageEntry {
  page: string
  title: string
  icon: string
}

/** A checkout the palette can switch to. */
export interface WorkspaceEntry {
  path: string
  name: string
  /** `path` with the home directory as `~`. */
  location: string
  /** The branch, or the short commit when `HEAD` is detached. */
  head?: string
  /** Uncommitted files, untracked included. */
  changes: number
  current: boolean
}

export interface WorkspaceGroup {
  id: string
  title: string
  icon: string
  workspaces: WorkspaceEntry[]
}

export interface PaletteData {
  pages: PageEntry[]
  groups: WorkspaceGroup[]
}

/** The API `src/preload/chrome.ts` exposes as `window.yadv`. */
export interface ChromeApi {
  state: () => Promise<WindowState>
  onState: (listener: (state: WindowState) => void) => void
  /** The main process asks: ⌘K from the menu, wherever the focus is. */
  onTogglePalette: (listener: () => void) => void
  setPaletteOpen: (open: boolean) => void
  palette: () => Promise<PaletteData>
  openPage: (page: string) => void
  openWorkspace: (path: string) => void
}

export const CHANNEL = {
  state: 'yadv:state',
  togglePalette: 'yadv:toggle-palette',
  paletteOpen: 'yadv:palette-open',
  palette: 'yadv:palette',
  openPage: 'yadv:open-page',
  openWorkspace: 'yadv:open-workspace',
  pageTheme: 'yadv:page-theme',
} as const
