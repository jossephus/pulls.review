# yadv

The `pulls.review` CLI in a desktop window instead of a browser tab. macOS only for now.

```sh
cd ~/code/some-repo
yadv                 # the uncommitted changes, or the current branch when there are none
yadv main...feat     # any target `pulls.review` takes
yadv --worktree
```

Running `yadv` again while the window is open switches it to the new repository and target;
there is only ever one window. In the window, ⌘K opens a palette to switch between this
repository's reviews, its git worktrees and its [Rift](https://github.com/anomalyco/rift)
workspaces.

## How it works

- `bin/yadv.mjs` starts `dist/yadv.app` - Electron's own bundle, renamed by
  `scripts/bundle.mjs` - on this checkout, relays its output until the launch is done, then
  returns the terminal.
- `src/server.ts` runs the CLI's own devframe definition (`pulls.review/devframe`) in Electron's
  main process; `src/window.ts` loads its page, already trusted, under a title strip of our own.
  A second `yadv` resolves its page, hands it to the running app through Electron's
  single-instance lock, and exits.
- `src/chrome` is the strip and the palette: Vue with `@antfu/design`, in a view over the page.
  The page itself is untouched; `src/preload/page.ts` only reads its light/dark switch.
- `src/workspaces` lists what the palette switches to. Each kind of checkout is one
  `WorkspaceSource` (`types.ts`), registered in `index.ts`.
- Links outside the review server open in the default browser.

## Setup

```sh
pnpm install
pnpm build                                 # core, the CLI and its client, then this package
ln -s "$PWD/packages/desktop/bin/yadv.mjs" ~/.local/bin/yadv  # any directory on PATH
```

Nothing outside `packages/desktop` changes except a few lines in `pnpm-workspace.yaml`, so
upstream merges stay clean.
