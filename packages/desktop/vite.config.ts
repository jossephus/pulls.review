import { fileURLToPath } from 'node:url'
import Vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'

/** The window's own UI - title strip and command palette - loaded from disk next to `main.mjs`. */
export default defineConfig({
  root: fileURLToPath(new URL('./src/chrome', import.meta.url)),
  base: './',
  plugins: [Vue(), UnoCSS({ configFile: fileURLToPath(new URL('./uno.config.ts', import.meta.url)) })],
  build: {
    outDir: fileURLToPath(new URL('./dist/chrome', import.meta.url)),
    emptyOutDir: true,
  },
})
