import { shell } from 'electron'
import { execFile } from 'node:child_process'
import { open, readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import mammoth from 'mammoth'
import type { FileChange, FileNode, FilePreview, ProjectInfo, WorktreeInfo } from '../src/shared/contracts'
import { collectGitChanges } from './git-changes'

const execFileAsync = promisify(execFile)
const IGNORED_DIRECTORIES = new Set(['.git', 'node_modules', 'out', 'dist', 'release', '.next', '.vite', 'coverage'])
const MAX_TREE_DEPTH = 4
const MAX_TREE_ITEMS = 900
const MAX_TEXT_PREVIEW_BYTES = 1_500_000
const MAX_BINARY_PREVIEW_BYTES = 20 * 1024 * 1024
const MARKDOWN_EXTENSIONS = new Set(['.md', '.mdown', '.markdown', '.mdx'])
const DIFF_EXTENSIONS = new Set(['.diff', '.patch'])
const TEXT_EXTENSIONS = new Set([
  '.c', '.cc', '.conf', '.cpp', '.cs', '.css', '.csv', '.env', '.go', '.h', '.hpp', '.html', '.ini', '.java', '.js',
  '.json', '.jsonc', '.jsx', '.kt', '.less', '.log', '.lua', '.mjs', '.php', '.properties', '.py', '.rb', '.rs', '.scss',
  '.sh', '.sql', '.svelte', '.svg', '.toml', '.ts', '.tsx', '.txt', '.vue', '.xml', '.yaml', '.yml',
])
const IMAGE_MIME = new Map([
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.gif', 'image/gif'], ['.webp', 'image/webp'], ['.bmp', 'image/bmp'], ['.ico', 'image/x-icon'],
])
const AUDIO_MIME = new Map([
  ['.mp3', 'audio/mpeg'], ['.wav', 'audio/wav'], ['.ogg', 'audio/ogg'], ['.m4a', 'audio/mp4'], ['.aac', 'audio/aac'], ['.flac', 'audio/flac'],
])

async function runGit(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      windowsHide: true,
      timeout: 5_000,
      maxBuffer: 4 * 1024 * 1024,
      encoding: 'utf8',
    })
    return stdout.trimEnd()
  } catch {
    return ''
  }
}

export class WorkspaceService {
  private currentPath?: string

  get path(): string | undefined {
    return this.currentPath
  }

  async setProject(projectPath: string): Promise<ProjectInfo> {
    const info = await stat(projectPath)
    if (!info.isDirectory()) throw new Error('所选路径不是文件夹。')
    this.currentPath = path.resolve(projectPath)
    return this.describe()
  }

  async describe(projectPath = this.requirePath()): Promise<ProjectInfo> {
    const gitRoot = await runGit(projectPath, ['rev-parse', '--show-toplevel'])
    const isGit = Boolean(gitRoot)
    const branch = isGit ? await runGit(projectPath, ['branch', '--show-current']) : ''
    const statusOutput = isGit ? await runGit(projectPath, ['status', '--porcelain=v1', '--untracked-files=all']) : ''

    return {
      name: path.basename(projectPath),
      path: projectPath,
      branch: branch || undefined,
      isGit,
      dirtyCount: statusOutput ? statusOutput.split(/\r?\n/).filter(Boolean).length : 0,
    }
  }

  async getChanges(projectPath = this.requirePath()): Promise<FileChange[]> {
    return collectGitChanges(projectPath)
  }

  async getFileTree(projectPath = this.requirePath()): Promise<FileNode[]> {
    let visited = 0

    const walk = async (directory: string, depth: number): Promise<FileNode[]> => {
      if (depth > MAX_TREE_DEPTH || visited >= MAX_TREE_ITEMS) return []
      let entries
      try {
        entries = await readdir(directory, { withFileTypes: true })
      } catch {
        return []
      }

      const sorted = entries
        .filter((entry) => !entry.name.startsWith('.') || entry.name === '.pi')
        .filter((entry) => !(entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)))
        .toSorted((left, right) => {
          if (left.isDirectory() !== right.isDirectory()) return left.isDirectory() ? -1 : 1
          return left.name.localeCompare(right.name)
        })

      const nodes: FileNode[] = []
      for (const entry of sorted) {
        if (visited >= MAX_TREE_ITEMS) break
        visited += 1
        const absolutePath = path.join(directory, entry.name)
        const relativePath = path.relative(projectPath, absolutePath).replaceAll('\\', '/')
        if (entry.isDirectory()) {
          nodes.push({
            name: entry.name,
            path: relativePath,
            kind: 'directory',
            children: await walk(absolutePath, depth + 1),
          })
        } else if (entry.isFile()) {
          nodes.push({ name: entry.name, path: relativePath, kind: 'file' })
        }
      }
      return nodes
    }

    return walk(projectPath, 0)
  }

  async getWorktrees(projectPath = this.requirePath()): Promise<WorktreeInfo[]> {
    const output = await runGit(projectPath, ['worktree', 'list', '--porcelain'])
    if (!output) return []
    const current = path.resolve(projectPath).toLocaleLowerCase()
    return output.split(/\r?\n\r?\n/).flatMap((block) => {
      const fields = block.split(/\r?\n/).filter(Boolean)
      const worktreePath = fields.find((line) => line.startsWith('worktree '))?.slice(9)
      if (!worktreePath) return []
      const branchRef = fields.find((line) => line.startsWith('branch '))?.slice(7)
      const head = fields.find((line) => line.startsWith('HEAD '))?.slice(5)
      const resolved = path.resolve(worktreePath)
      return [{
        path: resolved,
        branch: branchRef?.replace(/^refs\/heads\//, ''),
        head,
        current: resolved.toLocaleLowerCase() === current,
        bare: fields.includes('bare'),
      }]
    })
  }

  async snapshot(knownProject?: ProjectInfo): Promise<{ project: ProjectInfo; changes: FileChange[]; files: FileNode[]; worktrees: WorktreeInfo[] }> {
    const currentPath = this.requirePath()
    const [project, changes, files, worktrees] = await Promise.all([
      knownProject ?? this.describe(currentPath),
      this.getChanges(currentPath),
      this.getFileTree(currentPath),
      this.getWorktrees(currentPath),
    ])
    return { project, changes, files, worktrees }
  }

  async openFile(relativePath: string): Promise<void> {
    const absolute = this.resolveWorkspacePath(relativePath)
    const error = await shell.openPath(absolute)
    if (error) throw new Error(error)
  }

  async previewFile(relativePath: string): Promise<FilePreview> {
    const absolute = this.resolveWorkspacePath(relativePath)
    const file = await stat(absolute)
    if (!file.isFile()) throw new Error('只能预览文件。')
    const extension = path.extname(absolute).toLocaleLowerCase()
    const base = { path: relativePath.replaceAll('\\', '/'), name: path.basename(absolute), size: file.size }

    if (extension === '.docx') {
      if (file.size > MAX_BINARY_PREVIEW_BYTES) return { ...base, kind: 'unsupported', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
      const result = await mammoth.convertToHtml(
        { path: absolute },
        { convertImage: mammoth.images.dataUri, externalFileAccess: false },
      )
      return { ...base, kind: 'docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', html: result.value }
    }

    const imageMime = IMAGE_MIME.get(extension)
    const audioMime = AUDIO_MIME.get(extension)
    if (imageMime || audioMime || extension === '.pdf') {
      const mimeType = imageMime ?? audioMime ?? 'application/pdf'
      if (file.size > MAX_BINARY_PREVIEW_BYTES) return { ...base, kind: 'unsupported', mimeType }
      const buffer = await readFile(absolute)
      return {
        ...base,
        kind: imageMime ? 'image' : audioMime ? 'audio' : 'pdf',
        mimeType,
        dataUrl: `data:${mimeType};base64,${buffer.toString('base64')}`,
      }
    }

    const content = await this.readTextPrefix(absolute, file.size)
    const looksBinary = content.includes('\u0000')
    if (looksBinary && !TEXT_EXTENSIONS.has(extension) && !MARKDOWN_EXTENSIONS.has(extension) && !DIFF_EXTENSIONS.has(extension)) {
      return { ...base, kind: 'unsupported', mimeType: 'application/octet-stream' }
    }
    return {
      ...base,
      kind: MARKDOWN_EXTENSIONS.has(extension) ? 'markdown' : DIFF_EXTENSIONS.has(extension) ? 'diff' : 'text',
      mimeType: 'text/plain',
      content,
      truncated: file.size > MAX_TEXT_PREVIEW_BYTES,
    }
  }

  private async readTextPrefix(filePath: string, size: number): Promise<string> {
    const length = Math.min(size, MAX_TEXT_PREVIEW_BYTES)
    const handle = await open(filePath, 'r')
    try {
      const buffer = Buffer.alloc(length)
      const result = await handle.read(buffer, 0, length, 0)
      return buffer.subarray(0, result.bytesRead).toString('utf8')
    } finally {
      await handle.close()
    }
  }

  private resolveWorkspacePath(relativePath: string): string {
    const root = this.requirePath()
    const absolute = path.resolve(root, relativePath)
    const relative = path.relative(root, absolute)
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('无法访问工作区之外的文件。')
    return absolute
  }

  private requirePath(): string {
    if (!this.currentPath) throw new Error('请先选择一个项目文件夹。')
    return this.currentPath
  }
}
