import type { UserConfig } from 'tsdown'
import { defineConfig } from 'tsdown'

/** Sandboxed preloads can't load ES modules, or any file but `electron`: one self-contained file each. */
function preload(name: string): UserConfig {
  return {
    entry: [`src/preload/${name}.ts`],
    outDir: 'dist/preload',
    clean: false,
    format: 'cjs',
    platform: 'node',
    dts: false,
  }
}

export default defineConfig([
  {
    // Dependencies stay external, so the devframe definition is loaded from the CLI's `dist`, next
    // to the `client` its `clientAssets` point at. The CLI's page helpers are bundled from source.
    entry: ['src/main.ts'],
    outDir: 'dist/main',
    platform: 'node',
    dts: false,
  },
  preload('chrome'),
  preload('page'),
])
