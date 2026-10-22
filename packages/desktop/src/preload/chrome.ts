import type { ChromeApi, WindowState } from '../ipc'
import { contextBridge, ipcRenderer } from 'electron'
import { CHANNEL } from '../ipc'

const api: ChromeApi = {
  state: () => ipcRenderer.invoke(CHANNEL.state),
  onState: listener => ipcRenderer.on(CHANNEL.state, (_event, state: WindowState) => listener(state)),
  onTogglePalette: listener => ipcRenderer.on(CHANNEL.togglePalette, () => listener()),
  setPaletteOpen: open => ipcRenderer.send(CHANNEL.paletteOpen, open),
  palette: () => ipcRenderer.invoke(CHANNEL.palette),
  openPage: page => ipcRenderer.send(CHANNEL.openPage, page),
  openWorkspace: path => ipcRenderer.send(CHANNEL.openWorkspace, path),
}

contextBridge.exposeInMainWorld('yadv', api)
