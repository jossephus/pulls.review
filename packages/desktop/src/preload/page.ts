import { ipcRenderer } from 'electron'
import { CHANNEL } from '../ipc'

// Runs beside the review page, in its own world: it only reads the page's light/dark switch (the
// `dark` class on <html>), so the title strip can follow it.
window.addEventListener('DOMContentLoaded', () => {
  const root = document.documentElement
  let dark: boolean | undefined
  const report = (): void => {
    if (root.classList.contains('dark') === dark)
      return
    dark = root.classList.contains('dark')
    ipcRenderer.send(CHANNEL.pageTheme, dark)
  }
  new MutationObserver(report).observe(root, { attributes: true, attributeFilter: ['class'] })
  report()
})
