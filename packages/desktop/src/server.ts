import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createDevServer } from 'devframe/adapters/dev'
import { createInteractiveAuth } from 'devframe/recipes/interactive-auth'
import { H3 } from 'h3'
import devframe from 'pulls.review/devframe'

type AuthHandler = ReturnType<typeof createInteractiveAuth>
type StartedServer = Awaited<ReturnType<typeof createDevServer>>

/**
 * The page keeps its settings (API keys, the local agent) in `localStorage`, which belongs to the
 * origin - port included. One port of its own, so they survive restarts. Not the CLI's 7390, so
 * `pulls.review` and yadv can run side by side.
 */
const PORT = 7391

export interface ReviewServer {
  origin: string
  /** `url` with the one-time code that lands the window already trusted. */
  trustedUrl: (url: string) => string
  close: () => Promise<void>
}

/** The CLI's ref-route fallback (`packages/cli/src/index.ts`), against the CLI's built client. */
function createAppWithRefRoutes(): H3 {
  const h3 = new H3()
  const index = fileURLToPath(new URL('./client/index.html', import.meta.resolve('pulls.review/devframe')))
  h3.use(async (event, next) => {
    if (!/^\/(?:compare|branch|commit|gh)\//.test(event.url.pathname) || !event.req.headers.get('accept')?.includes('text/html'))
      return next()
    return new Response(await readFile(index, 'utf8'), { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  })
  return h3
}

/** The CLI's devframe server for the repository at `process.cwd()`, which devframe reads at start. */
export async function startServer(): Promise<ReviewServer> {
  let auth: AuthHandler | undefined
  const start = (port: number | undefined): Promise<StartedServer> => createDevServer(devframe, {
    app: createAppWithRefRoutes(),
    port,
    openBrowser: false,
    // The window lands trusted like the CLI's `--open` tab: the one-time code rides in the URL.
    // devframe accepts a factory here, though `createDevServer`'s option type omits it.
    // eslint-disable-next-line slop/no-chained-type-assertions -- devframe's own option type is narrower than what it accepts
    auth: ((ctx: Parameters<typeof createInteractiveAuth>[0]) => (auth = createInteractiveAuth(ctx, { banner: () => {} }))) as unknown as AuthHandler,
  })
  // Taken by something else: any free port still reviews, the settings just start over.
  const server = await start(PORT).catch(() => start(undefined))
  return {
    origin: server.origin,
    trustedUrl: url => auth?.buildOpenUrl?.(url) ?? url,
    close: () => server.close(),
  }
}
