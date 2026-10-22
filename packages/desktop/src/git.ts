import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

export async function output(command: string, args: string[], cwd?: string): Promise<string> {
  const { stdout } = await run(command, args, { cwd, maxBuffer: 16 * 1024 * 1024 })
  return stdout
}

/** A command's stdout, split into non-empty lines. */
export async function lines(command: string, args: string[], cwd?: string): Promise<string[]> {
  return (await output(command, args, cwd)).split('\n').map(line => line.trim()).filter(Boolean)
}

export async function toplevel(cwd: string): Promise<string> {
  const [path] = await lines('git', ['rev-parse', '--show-toplevel'], cwd)
  return path!
}

/** Uncommitted files, untracked included. */
export async function changeCount(cwd: string): Promise<number> {
  return (await lines('git', ['status', '--porcelain'], cwd)).length
}

/** The branch, or the short commit when `HEAD` is detached. */
export async function head(cwd: string): Promise<string | undefined> {
  const branch = await lines('git', ['symbolic-ref', '--short', '-q', 'HEAD'], cwd).catch(() => [])
  if (branch[0])
    return branch[0]
  return (await lines('git', ['rev-parse', '--short', 'HEAD'], cwd).catch(() => []))[0]
}
