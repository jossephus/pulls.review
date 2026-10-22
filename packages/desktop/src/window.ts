import type { PaletteData, WindowState } from './ipc'
import type { ReviewServer } from './server'
import { writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { app, BaseWindow, ipcMain, Menu, shell, WebContentsView } from 'electron'
import { toplevel } from './git'
import { CHANNEL } from './ipc'
import { defaultPage, describePage, pageEntries } from './pages'
import { startServer } from './server'
import { listWorkspaces } from './workspaces'

/** What one `yadv` invocation, or a palette pick, asks for. */
export interface Review {
  cwd: string
  page: string
}

/** The title strip's height; it holds the traffic lights. */
const STRIP = 40
/** The page is sized for a browser tab; a window reads better slightly smaller. */
const DEFAULT_ZOOM = 0.9
const BACKGROUND = { dark: '#121212', light: '#ffffff' }

const prefsFile = (): string => join(app.getPath('userData'), 'yadv.json')

async function readZoom(): Promise<number> {
  try {
    const { zoom } = JSON.parse(await readFile(prefsFile(), 'utf8'))
    return typeof zoom === 'number' ? zoom : DEFAULT_ZOOM
  }
  catch {
    return DEFAULT_ZOOM
  }
}

const preload = (name: string): string => fileURLToPath(new URL(`../preload/${name}.cjs`, import.meta.url))

/**
 * One window, two views: the review page, untouched, and below-the-traffic-lights UI of our own
 * (`src/chrome`) - a title strip that grows over the page, transparent, while the palette is open.
 */
class ReviewWindow {
  readonly window: BaseWindow
  readonly page: WebContentsView
  readonly chrome: WebContentsView
  server: ReviewServer | undefined
  root = ''
  state: WindowState = { repo: '', page: '/', label: '', dark: true }
  paletteOpen = false

  constructor(zoom: number) {
    this.window = new BaseWindow({
      width: 1440,
      height: 960,
      minWidth: 640,
      minHeight: 400,
      show: false,
      title: 'yadv',
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 14 },
      backgroundColor: BACKGROUND.dark,
    })
    this.page = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, preload: preload('page') } })
    this.chrome = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, preload: preload('chrome') } })
    this.chrome.setBackgroundColor('#00000000')
    this.window.contentView.addChildView(this.page)
    this.window.contentView.addChildView(this.chrome)
    this.chrome.webContents.loadFile(fileURLToPath(new URL('../chrome/index.html', import.meta.url)))
    this.layout()
    this.window.on('resize', () => this.layout())

    const contents = this.page.webContents
    // Everything outside the review server belongs in the browser.
    const isExternal = (url: string): boolean => !this.server || !url.startsWith(`${this.server.origin}/`)
    contents.setWindowOpenHandler(({ url }) => {
      if (isExternal(url)) {
        shell.openExternal(url)
        return { action: 'deny' }
      }
      return { action: 'allow' }
    })
    contents.on('will-navigate', (event, url) => {
      if (isExternal(url)) {
        event.preventDefault()
        shell.openExternal(url)
      }
    })
    const track = (_event: unknown, url: string): void => {
      const { pathname, search } = new URL(url)
      this.update({ page: pathname + search })
    }
    contents.on('did-navigate', track)
    contents.on('did-navigate-in-page', track)
    contents.on('page-title-updated', (_event, title) => this.window.setTitle(title))
    // Chromium holds the zoom (⌘+ / ⌘- / ⌘0) per origin only while the app runs; closing saves it.
    contents.once('did-finish-load', () => contents.setZoomFactor(zoom))
    // Sync: the app quits right after its last window closes.
    this.window.on('close', () => {
      try {
        writeFileSync(prefsFile(), JSON.stringify({ zoom: contents.getZoomFactor() }))
      }
      catch {}
    })
  }

  layout(): void {
    const { width, height } = this.window.getContentBounds()
    this.page.setBounds({ x: 0, y: STRIP, width, height: height - STRIP })
    this.chrome.setBounds({ x: 0, y: 0, width, height: this.paletteOpen ? height : STRIP })
  }

  update(patch: Partial<WindowState>): void {
    this.state = { ...this.state, ...patch }
    this.state.label = describePage(this.state.page)
    this.window.setBackgroundColor(this.state.dark ? BACKGROUND.dark : BACKGROUND.light)
    this.chrome.webContents.send(CHANNEL.state, this.state)
  }

  setPaletteOpen(open: boolean): void {
    this.paletteOpen = open
    this.layout()
    ;(open ? this.chrome : this.page).webContents.focus()
  }

  /**
   * devframe reads the repository from `process.cwd()` when its server starts, so switching
   * repositories restarts the server from the new directory.
   */
  async open(review: Review): Promise<void> {
    await this.server?.close()
    this.server = undefined
    process.chdir(review.cwd)
    this.server = await startServer()
    this.root = await toplevel(review.cwd).catch(() => review.cwd)
    this.update({ repo: basename(this.root), page: review.page })
    await this.page.webContents.loadURL(this.server.trustedUrl(`${this.server.origin}${review.page}`))
    this.window.show()
    this.window.focus()
    this.page.webContents.focus()
    app.focus({ steal: true })
  }

  openPage(page: string): void {
    if (this.server)
      this.page.webContents.loadURL(`${this.server.origin}${page}`)
  }

  async palette(): Promise<PaletteData> {
    const [pages, groups] = await Promise.all([pageEntries(this.root), listWorkspaces(this.root)])
    return { pages, groups }
  }
}

function setMenu(target: () => ReviewWindow | undefined): void {
  const page = (): Electron.WebContents | undefined => target()?.page.webContents
  const zoomBy = (step: number) => () => {
    const contents = page()
    contents?.setZoomFactor(Math.min(3, Math.max(0.3, Math.round((contents.getZoomFactor() + step) * 10) / 10)))
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' },
    { role: 'editMenu' },
    {
      label: 'Go',
      submenu: [
        { label: 'Command Palette…', accelerator: 'CmdOrCtrl+K', click: () => target()?.chrome.webContents.send(CHANNEL.togglePalette) },
        { type: 'separator' },
        { label: 'Back', accelerator: 'CmdOrCtrl+[', click: () => page()?.navigationHistory.goBack() },
        { label: 'Forward', accelerator: 'CmdOrCtrl+]', click: () => page()?.navigationHistory.goForward() },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => page()?.reload() },
        { type: 'separator' },
        { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', click: () => page()?.setZoomFactor(DEFAULT_ZOOM) },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: zoomBy(0.1) },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', click: zoomBy(0.1), visible: false, acceleratorWorksWhenHidden: true },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: zoomBy(-0.1) },
        { type: 'separator' },
        { label: 'Developer Tools', accelerator: 'Alt+CmdOrCtrl+I', click: () => page()?.toggleDevTools() },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
  ]))
}

let current: ReviewWindow | undefined
/** Switches run one at a time, so a quick second `yadv` can't race the first restart. */
let queue = Promise.resolve()

/** Shows `review` in the one window, creating it on the first call. */
export function show(review: Review): Promise<void> {
  const run = queue.then(async () => {
    if (!current) {
      const win = new ReviewWindow(await readZoom())
      win.window.on('closed', () => {
        current = undefined
      })
      current = win
    }
    await current.open(review)
  })
  queue = run.catch((error) => {
    console.error(error)
  })
  return run
}

export function setup(): void {
  setMenu(() => current)
  ipcMain.handle(CHANNEL.state, () => current?.state)
  ipcMain.handle(CHANNEL.palette, () => current?.palette())
  ipcMain.on(CHANNEL.paletteOpen, (_event, open: boolean) => current?.setPaletteOpen(open))
  ipcMain.on(CHANNEL.openPage, (_event, page: string) => current?.openPage(page))
  ipcMain.on(CHANNEL.openWorkspace, async (_event, path: string) => {
    show({ cwd: path, page: await defaultPage(path) })
  })
  ipcMain.on(CHANNEL.pageTheme, (event, dark: boolean) => {
    if (event.sender === current?.page.webContents)
      current.update({ dark })
  })
  app.on('will-quit', () => {
    current?.server?.close()
  })
}
