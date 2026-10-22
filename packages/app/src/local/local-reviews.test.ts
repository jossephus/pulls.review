import type { DiffsPayload, FileChange } from '@pulls.review/core/types'
import { describe, expect, it } from 'vitest'
import { agentPrompt, reanchor } from './local-reviews'

function file(patch: string, newStart = 10): FileChange {
  const lines = patch.split('\n')
  return {
    path: 'src/a.ts',
    status: 'modified',
    additions: lines.filter(line => line.startsWith('+')).length,
    deletions: lines.filter(line => line.startsWith('-')).length,
    isBinary: false,
    sha: 'sha',
    hunks: [{ header: '@@', oldStart: 10, oldLines: 0, newStart, newLines: 0, patch }],
  }
}

const diff = (...files: FileChange[]): DiffsPayload => ({ ref: { kind: 'local', repo: '/repo', target: '' }, title: 'Working tree', files })

const thread = {
  path: 'src/a.ts',
  side: 'additions' as const,
  line: 11,
  anchor: 'const b = 2',
  quote: '+const b = 2',
  resolved: false,
  comments: [{ id: 1, body: 'Rename `b`.', createdAt: '', sent: false }],
}

describe('reanchor', () => {
  it('keeps a thread whose line still reads the same', () => {
    const anchored = reanchor(thread, diff(file(' const a = 1\n+const b = 2')))
    expect(anchored).toBe(thread)
  })

  it('follows the line to its nearest new position', () => {
    const anchored = reanchor({ ...thread, startLine: 10 }, diff(file(' const a = 1\n+// note\n+const b = 2\n+const c = 3')))
    expect(anchored).toMatchObject({ line: 12, startLine: 11 })
  })

  it('reads the deletions side by old line numbers', () => {
    const old = { ...thread, side: 'deletions' as const, line: 10, anchor: 'gone()' }
    expect(reanchor(old, diff(file('-gone()\n+kept()')))).toBe(old)
  })

  it('is outdated once the line or its file is gone', () => {
    expect(reanchor(thread, diff(file(' const a = 1\n+const b = 3')))).toBeUndefined()
    expect(reanchor(thread, diff())).toBeUndefined()
  })
})

describe('agentPrompt', () => {
  it('lists unsent comments under their lines, with earlier ones quoted', () => {
    const sent = { ...thread, line: 20, comments: [{ id: 2, body: 'Old note', createdAt: '', sent: true }, { id: 3, body: 'Still wrong.', createdAt: '', sent: false }] }
    const done = { ...thread, line: 30, comments: [{ id: 4, body: 'Handled', createdAt: '', sent: true }] }
    expect(agentPrompt([thread, sent, done], ' Run the tests. ')).toMatchInlineSnapshot(`
      "I reviewed your changes. Address each comment below; the diff lines it is about come first.

      ## src/a.ts:11

      \`\`\`diff
      +const b = 2
      \`\`\`

      Rename \`b\`.

      ## src/a.ts:20

      \`\`\`diff
      +const b = 2
      \`\`\`

      > Old note

      Still wrong.

      ## Overall

      Run the tests."
    `)
  })
})
