import { execFile } from 'node:child_process'
import { open, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import type { ChangeStatus, FileChange } from '../src/shared/contracts'

const execFileAsync = promisify(execFile)
const MAX_DIFF_LENGTH = 24_000
const MAX_UNTRACKED_TEXT_BYTES = 1_500_000
const BINARY_SAMPLE_BYTES = 16_384
const BINARY_EXTENSIONS = new Set([
  '.7z', '.aab', '.apk', '.avi', '.bin', '.bmp', '.class', '.db', '.dll', '.dmg', '.doc', '.docx', '.eot', '.exe',
  '.flac', '.gif', '.gz', '.ico', '.jar', '.jpeg', '.jpg', '.m4a', '.mov', '.mp3', '.mp4', '.ogg', '.otf', '.pdf',
  '.png', '.rar', '.so', '.sqlite', '.tar', '.ttf', '.wav', '.webm', '.webp', '.woff', '.woff2', '.xls', '.xlsx', '.zip',
])

interface GitStatusEntry {
  rawStatus: string
  status: ChangeStatus
  path: string
  previousPath?: string
}

interface NumStat {
  additions: number
  deletions: number
  binary: boolean
}

interface UntrackedInspection {
  additions: number
  binary: boolean
  diff: string
  diffTruncated: boolean
  large: boolean
  size: number
}

async function runGit(cwd: string, args: string[], trim = true): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
      encoding: 'utf8',
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_LITERAL_PATHSPECS: '1' },
    })
    return trim ? stdout.trimEnd() : stdout
  } catch {
    return ''
  }
}

export function parseChangeStatus(raw: string): ChangeStatus {
  if (raw === '??') return 'untracked'
  if (raw.includes('R')) return 'renamed'
  if (raw.includes('A')) return 'added'
  if (raw.includes('D')) return 'deleted'
  return 'modified'
}

export function parsePorcelainV1Z(output: string): GitStatusEntry[] {
  if (!output) return []
  const fields = output.split('\0')
  const entries: GitStatusEntry[] = []

  for (let index = 0; index < fields.length;) {
    const record = fields[index++]
    if (!record || record.length < 4) continue
    const rawStatus = record.slice(0, 2)
    const filePath = record.slice(3)
    const renamedOrCopied = rawStatus.includes('R') || rawStatus.includes('C')
    const previousPath = renamedOrCopied ? fields[index++] || undefined : undefined
    entries.push({ rawStatus, status: parseChangeStatus(rawStatus), path: filePath, previousPath })
  }

  return entries
}

export function parseNumStat(output: string): NumStat {
  const match = output.match(/^(-|\d+)\t(-|\d+)\t/mu)
  if (!match) return { additions: 0, deletions: 0, binary: false }
  const binary = match[1] === '-' || match[2] === '-'
  return {
    additions: binary ? 0 : Number.parseInt(match[1], 10),
    deletions: binary ? 0 : Number.parseInt(match[2], 10),
    binary,
  }
}

function countTextLines(buffer: Buffer): number {
  if (!buffer.length) return 0
  let lines = 0
  for (const byte of buffer) {
    if (byte === 10) lines += 1
  }
  return lines + (buffer.at(-1) === 10 ? 0 : 1)
}

function isProbablyBinary(filePath: string, buffer: Buffer): boolean {
  if (BINARY_EXTENSIONS.has(path.extname(filePath).toLocaleLowerCase())) return true
  if (buffer.includes(0)) return true
  if (!buffer.length) return false
  let controlBytes = 0
  for (const byte of buffer) {
    if (byte < 7 || (byte > 13 && byte < 32)) controlBytes += 1
  }
  return controlBytes / buffer.length > 0.08
}

function createUntrackedDiff(filePath: string, buffer: Buffer, additions: number): { diff: string; truncated: boolean } {
  const normalizedPath = filePath.replaceAll('\\', '/')
  const header = `diff --git a/${normalizedPath} b/${normalizedPath}\nnew file mode 100644\n--- /dev/null\n+++ b/${normalizedPath}\n@@ -0,0 +1,${additions} @@\n`
  const lines = buffer.toString('utf8').replaceAll('\r\n', '\n').split('\n')
  if (lines.at(-1) === '') lines.pop()
  let diff = header
  let truncated = false

  for (const line of lines) {
    const rendered = `+${line}\n`
    if (diff.length + rendered.length > MAX_DIFF_LENGTH) {
      truncated = true
      break
    }
    diff += rendered
  }
  if (truncated) diff += '+… 内容过长，已截断\n'
  return { diff: diff.trimEnd(), truncated }
}

async function readPrefix(filePath: string, size: number): Promise<Buffer> {
  const handle = await open(filePath, 'r')
  try {
    const buffer = Buffer.alloc(Math.min(size, BINARY_SAMPLE_BYTES))
    const result = await handle.read(buffer, 0, buffer.length, 0)
    return buffer.subarray(0, result.bytesRead)
  } finally {
    await handle.close()
  }
}

async function inspectUntrackedFile(absolutePath: string, relativePath: string): Promise<UntrackedInspection> {
  try {
    const file = await stat(absolutePath)
    if (!file.isFile()) return { additions: 0, binary: false, diff: '', diffTruncated: false, large: false, size: 0 }
    const sample = await readPrefix(absolutePath, file.size)
    const binary = isProbablyBinary(relativePath, sample)
    if (binary) return { additions: 0, binary: true, diff: '', diffTruncated: false, large: false, size: file.size }
    if (file.size > MAX_UNTRACKED_TEXT_BYTES) {
      return { additions: 0, binary: false, diff: '', diffTruncated: true, large: true, size: file.size }
    }
    const content = await readFile(absolutePath)
    const additions = countTextLines(content)
    const preview = createUntrackedDiff(relativePath, content, additions)
    return {
      additions,
      binary: false,
      diff: preview.diff,
      diffTruncated: preview.truncated,
      large: false,
      size: file.size,
    }
  } catch {
    return { additions: 0, binary: false, diff: '', diffTruncated: false, large: false, size: 0 }
  }
}

async function fileSize(projectPath: string, filePath: string): Promise<number | undefined> {
  try {
    const file = await stat(path.join(projectPath, filePath))
    return file.isFile() ? file.size : undefined
  } catch {
    return undefined
  }
}

export async function collectGitChanges(projectPath: string): Promise<FileChange[]> {
  const statusOutput = await runGit(projectPath, ['status', '--porcelain=v1', '-z', '--untracked-files=all'], false)
  const entries = parsePorcelainV1Z(statusOutput).slice(0, 80)

  return Promise.all(entries.map(async (entry) => {
    if (entry.status === 'untracked') {
      const inspection = await inspectUntrackedFile(path.join(projectPath, entry.path), entry.path)
      return {
        path: entry.path,
        previousPath: entry.previousPath,
        status: entry.status,
        additions: inspection.additions,
        deletions: 0,
        diff: inspection.diff,
        binary: inspection.binary,
        large: inspection.large,
        size: inspection.size,
        diffTruncated: inspection.diffTruncated,
      }
    }

    const [numstatOutput, patch, size] = await Promise.all([
      runGit(projectPath, ['diff', '--numstat', 'HEAD', '--', entry.path]),
      runGit(projectPath, ['diff', '--no-ext-diff', '--unified=3', '--no-color', 'HEAD', '--', entry.path]),
      fileSize(projectPath, entry.path),
    ])
    const numstat = parseNumStat(numstatOutput)
    return {
      path: entry.path,
      previousPath: entry.previousPath,
      status: entry.status,
      additions: numstat.additions,
      deletions: numstat.deletions,
      diff: numstat.binary ? '' : patch.slice(0, MAX_DIFF_LENGTH),
      binary: numstat.binary,
      large: false,
      size,
      diffTruncated: !numstat.binary && patch.length > MAX_DIFF_LENGTH,
    }
  }))
}
