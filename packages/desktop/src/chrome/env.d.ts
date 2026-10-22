import type { ChromeApi } from '../ipc'

declare global {
  interface Window {
    yadv: ChromeApi
  }
}
