import type { CacheRepositories } from '@pulls.review/core/cache'
import type { CommentAuthor, CommentThread, DiffSide, DiffsPayload, FileChange, ReviewData, ReviewsApi, Viewer } from '@pulls.review/core/types'
import type { LocalRpc } from './connection'
import { LOCAL_RPC } from '@pulls.review/core/local-rpc'
import { DiffSideSchema } from '@pulls.review/core/types'
import * as v from 'valibot'
import { buildChatQuote } from '../components/chat/chat-quotes'
import { t } from '../i18n'

/** The only author of local comments: there is no account behind them. */
export const LOCAL_VIEWER: Viewer = { login: 'you', canWrite: true }
// An image that fails to load, so the avatar shows the initial instead of github.com/you.png.
const AUTHOR: CommentAuthor = { login: LOCAL_VIEWER.login, avatarUrl: 'data:,' }

/** Every comment waits in one review until it is handed to the agent. */
const PENDING_REVIEW = { id: 0, nodeId: 'local', body: '' }

const LocalCommentSchema = v.object({
  id: v.number(),
  body: v.string(),
  createdAt: v.string(),
  /** Handed to the agent; until then the comment is a pending draft. */
  sent: v.boolean(),
})

const LocalThreadSchema = v.object({
  path: v.string(),
  side: DiffSideSchema,
  line: v.number(),
  startLine: v.optional(v.number()),
  startSide: v.optional(DiffSideSchema),
  /** The anchor line's text: finds the line again after the diff changes under it. */
  anchor: v.string(),
  /** The commented lines as the reviewer saw them, in unified-diff form. */
  quote: v.string(),
  resolved: v.boolean(),
  comments: v.array(LocalCommentSchema),
})
type LocalThread = v.InferOutput<typeof LocalThreadSchema>

const LocalReviewSchema = v.object({
  nextId: v.number(),
  threads: v.array(LocalThreadSchema),
})
type LocalReview = v.InferOutput<typeof LocalReviewSchema>

/** Each diff line's text by its number on `side`; context lines are on both. */
function lineTexts(file: FileChange, side: DiffSide): Map<number, string> {
  const texts = new Map<number, string>()
  const otherSide = side === 'additions' ? '-' : '+'
  for (const hunk of file.hunks) {
    let line = side === 'additions' ? hunk.newStart : hunk.oldStart
    for (const text of hunk.patch.split('\n')) {
      if (!text.startsWith(otherSide) && !text.startsWith('\\'))
        texts.set(line++, text.slice(1))
    }
  }
  return texts
}

/**
 * Moves `thread` to where its anchor line went in `diff`: the same line when it still reads the
 * same, else the nearest line that does. `undefined` when the line is gone (the thread is outdated).
 */
export function reanchor(thread: LocalThread, diff: DiffsPayload | undefined): LocalThread | undefined {
  const file = diff?.files.find(file => file.path === thread.path)
  if (!file)
    return undefined
  const texts = lineTexts(file, thread.side)
  if (texts.get(thread.line) === thread.anchor)
    return thread
  let best: number | undefined
  for (const [line, text] of texts) {
    if (text === thread.anchor && (best === undefined || Math.abs(line - thread.line) < Math.abs(best - thread.line)))
      best = line
  }
  if (best === undefined)
    return undefined
  const shift = best - thread.line
  return { ...thread, line: best, startLine: thread.startLine === undefined ? undefined : thread.startLine + shift }
}

function lineLabel(thread: Pick<LocalThread, 'path' | 'side' | 'line' | 'startLine'>): string {
  const range = thread.startLine === undefined ? `${thread.line}` : `${thread.startLine}-${thread.line}`
  return `${thread.path}:${range}${thread.side === 'deletions' ? ' (old)' : ''}`
}

/**
 * The prompt handing `threads`' unsent comments to the agent: one section per thread with the
 * lines it is about, earlier (already sent) comments quoted for context.
 */
export function agentPrompt(threads: LocalThread[], summary: string): string {
  const sections = threads.filter(thread => thread.comments.some(comment => !comment.sent)).map((thread) => {
    const comments = thread.comments.map(comment => comment.sent
      ? comment.body.split('\n').map(line => `> ${line}`).join('\n')
      : comment.body)
    return [`## ${lineLabel(thread)}`, `\`\`\`diff\n${thread.quote}\n\`\`\``, ...comments].join('\n\n')
  })
  return [
    'I reviewed your changes. Address each comment below; the diff lines it is about come first.',
    ...sections,
    ...summary.trim() ? [`## Overall\n\n${summary.trim()}`] : [],
  ].join('\n\n')
}

/**
 * Review comments on a local diff, kept with the repository's cache (`.git/pulls-review/`) and
 * handed to the coding agent that wrote the diff instead of being posted anywhere.
 */
export function createLocalReviews(rpc: LocalRpc, cache: CacheRepositories, key: () => Promise<string>): ReviewsApi {
  const storageKey = async () => `local-review:${await key()}`

  async function read(): Promise<LocalReview> {
    const raw = v.parse(v.nullable(v.string()), await rpc.call(LOCAL_RPC.storageGetItem, { key: await storageKey() }))
    const parsed = raw ? v.safeParse(LocalReviewSchema, JSON.parse(raw)) : undefined
    return parsed?.success ? parsed.output : { nextId: 1, threads: [] }
  }

  async function write(review: LocalReview): Promise<void> {
    await rpc.call(LOCAL_RPC.storageSetItem, { key: await storageKey(), value: JSON.stringify(review) })
  }

  async function update(change: (review: LocalReview) => void): Promise<void> {
    const review = await read()
    change(review)
    review.threads = review.threads.filter(thread => thread.comments.length)
    await write(review)
  }

  /** The diff on screen: the store installs every diff it shows into the cache first. */
  const loadedDiff = async () => (await cache.diffs.get(await key()))?.diff

  function newComment(review: LocalReview, body: string) {
    return { id: review.nextId++, body, createdAt: new Date().toISOString(), sent: false }
  }

  function findComment(review: LocalReview, id: number) {
    for (const thread of review.threads) {
      const index = thread.comments.findIndex(comment => comment.id === id)
      if (index !== -1)
        return { thread, index }
    }
    throw new Error(t('errors.commentGone'))
  }

  return {
    audience: 'agent',
    async fetch(): Promise<ReviewData> {
      const review = await read()
      const diff = await loadedDiff()
      let moved = false
      const threads = review.threads.map((stored, index): CommentThread => {
        const anchored = reanchor(stored, diff)
        if (anchored && anchored !== stored) {
          review.threads[index] = anchored
          moved = true
        }
        const [root] = stored.comments
        return {
          rootId: root!.id,
          threadId: String(root!.id),
          path: stored.path,
          side: stored.side,
          line: anchored?.line,
          startLine: anchored?.startLine,
          startSide: stored.startSide,
          outdated: !anchored,
          resolved: stored.resolved,
          pending: !root!.sent,
          comments: stored.comments.map(comment => ({ id: comment.id, author: AUTHOR, body: comment.body, createdAt: comment.createdAt, pending: !comment.sent })),
        }
      })
      // Following the code is what keeps a thread on its line through several rounds of edits.
      if (moved)
        await write(review)
      return { threads, summaries: [], pendingReview: PENDING_REVIEW }
    },
    async addComment({ target, body }) {
      const file = (await loadedDiff())?.files.find(file => file.path === target.path)
      if (!file)
        throw new Error(t('errors.diffNotLoaded'))
      const anchor = lineTexts(file, target.side).get(target.line) ?? ''
      const quote = buildChatQuote(file, { start: target.startLine ?? target.line, side: target.startSide ?? target.side, end: target.line, endSide: target.side })?.code
      await update((review) => {
        review.threads.push({
          ...target,
          anchor,
          quote: quote ?? anchor,
          resolved: false,
          comments: [newComment(review, body)],
        })
      })
    },
    reply: (rootCommentId, body) => update((review) => {
      const { thread } = findComment(review, rootCommentId)
      thread.comments.push(newComment(review, body))
    }),
    editComment: (commentId, body) => update((review) => {
      const { thread, index } = findComment(review, commentId)
      thread.comments[index]!.body = body
    }),
    // Deleting the root comment deletes its thread, as on GitHub.
    deleteComment: commentId => update((review) => {
      const { thread, index } = findComment(review, commentId)
      thread.comments = index === 0 ? [] : thread.comments.toSpliced(index, 1)
    }),
    resolveThread: threadId => update((review) => {
      findComment(review, Number(threadId)).thread.resolved = true
    }),
    async submitReview(_verdict, body) {
      const review = await read()
      // Copied before anything is marked sent: a failed copy leaves every comment pending.
      await navigator.clipboard.writeText(agentPrompt(review.threads, body))
      for (const thread of review.threads) {
        for (const comment of thread.comments)
          comment.sent = true
      }
      await write(review)
    },
    discardPendingReview: () => update((review) => {
      for (const thread of review.threads)
        thread.comments = thread.comments[0]?.sent ? thread.comments.filter(comment => comment.sent) : []
    }),
  }
}
