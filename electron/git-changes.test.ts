import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { collectGitChanges, parseNumStat, parsePorcelainV1Z } from './git-changes'

const execFileAsync = promisify(execFile)
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('Git change parsing', () => {
  it('preserves raw UTF-8 paths and rename origins from porcelain -z output', () => {
    const entries = parsePorcelainV1Z('?? 花生日记/260.py\0R  花生日记/新版.py\0花生日记/旧版.py\0')
    expect(entries).toEqual([
      { rawStatus: '??', status: 'untracked', path: '花生日记/260.py', previousPath: undefined },
      { rawStatus: 'R ', status: 'renamed', path: '花生日记/新版.py', previousPath: '花生日记/旧版.py' },
    ])
  })

  it('distinguishes binary numstat from real zero line counts', () => {
    expect(parseNumStat('-\t-\tapp/base.apk')).toEqual({ additions: 0, deletions: 0, binary: true })
    expect(parseNumStat('12\t3\tsrc/index.ts')).toEqual({ additions: 12, deletions: 3, binary: false })
  })

  it('counts an untracked UTF-8 source file and classifies APK as binary', async () => {
    const projectPath = await mkdtemp(path.join(os.tmpdir(), 'pi-desktop-git-changes-'))
    temporaryDirectories.push(projectPath)
    await execFileAsync('git', ['init', '--quiet'], { cwd: projectPath, windowsHide: true })
    const nested = path.join(projectPath, '花生日记')
    await mkdir(nested)
    await writeFile(path.join(nested, '260.py'), 'print("你好")\nprint("Pi")\n', 'utf8')
    await writeFile(path.join(nested, 'base.apk'), Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x08, 0x00]))

    const changes = await collectGitChanges(projectPath)
    const source = changes.find((change) => change.path.endsWith('260.py'))
    const apk = changes.find((change) => change.path.endsWith('base.apk'))

    expect(source).toMatchObject({ path: '花生日记/260.py', status: 'untracked', additions: 2, deletions: 0, binary: false })
    expect(source?.diff).toContain('+print("你好")')
    expect(apk).toMatchObject({ path: '花生日记/base.apk', status: 'untracked', additions: 0, deletions: 0, binary: true })
    expect(apk?.diff).toBe('')
  })
})
