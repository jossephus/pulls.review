import { fileURLToPath } from 'node:url'
import { presetAnthonyDesign } from '@antfu/design/unocss'
import { defineConfig, presetIcons, presetWind3, transformerDirectives, transformerVariantGroup } from 'unocss'

/** The app's presets (`packages/app/uno.config.ts`), so the strip and palette match the page. */
export default defineConfig({
  content: {
    // The main process names the palette's icons (`src/pages.ts`, `src/workspaces/*`).
    filesystem: [fileURLToPath(new URL('./src/**/*.ts', import.meta.url))],
    pipeline: {
      include: [/\.(vue|ts|html)($|\?)/, /@antfu[\\/]design[\\/]components[\\/].*\.vue$/],
    },
  },
  shortcuts: [
    {
      'z-modal': 'z-[100]',
      'z-modal-backdrop': 'z-[101]',
      'z-modal-content': 'z-[102]',
      'drag-region': '[-webkit-app-region:drag]',
      'no-drag-region': '[-webkit-app-region:no-drag]',
    },
  ],
  presets: [
    presetAnthonyDesign(),
    presetWind3(),
    presetIcons({ scale: 1.2 }),
  ],
  transformers: [
    transformerDirectives(),
    transformerVariantGroup(),
  ],
})
