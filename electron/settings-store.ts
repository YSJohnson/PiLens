import { app, safeStorage } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

interface PersistedSettings {
  recentProjects: string[]
  lastSessions?: Record<string, string>
  interruptedRun?: { projectPath: string; sessionFile?: string; startedAt: number }
  modelKey?: string
  thinkingLevel?: string
  providerKeys?: Record<string, string>
  archivedSessions?: string[]
}

const EMPTY_SETTINGS: PersistedSettings = {
  recentProjects: [],
  providerKeys: {},
  lastSessions: {},
  archivedSessions: [],
}

export class SettingsStore {
  private readonly filePath = path.join(app.getPath('userData'), 'settings.json')
  private data: PersistedSettings = { ...EMPTY_SETTINGS }

  async load(): Promise<void> {
    try {
      const content = await readFile(this.filePath, 'utf8')
      const parsed = JSON.parse(content) as PersistedSettings
      this.data = {
        ...EMPTY_SETTINGS,
        ...parsed,
        recentProjects: Array.isArray(parsed.recentProjects) ? parsed.recentProjects : [],
        providerKeys: parsed.providerKeys ?? {},
        lastSessions: parsed.lastSessions ?? {},
        archivedSessions: Array.isArray(parsed.archivedSessions) ? parsed.archivedSessions : [],
      }
    } catch {
      this.data = { ...EMPTY_SETTINGS }
    }
  }

  getRecentProjects(): string[] {
    return [...this.data.recentProjects]
  }

  async touchProject(projectPath: string): Promise<void> {
    const deduped = this.data.recentProjects.filter((item) => item !== projectPath)
    this.data.recentProjects = [projectPath, ...deduped].slice(0, 12)
    await this.persist()
  }

  getLastSession(projectPath: string): string | undefined {
    return this.data.lastSessions?.[projectPath]
  }

  async setLastSession(projectPath: string, sessionFile: string): Promise<void> {
    this.data.lastSessions ??= {}
    this.data.lastSessions[projectPath] = sessionFile
    await this.persist()
  }

  async markRunningSession(projectPath: string, sessionFile?: string): Promise<void> {
    this.data.interruptedRun = { projectPath, sessionFile, startedAt: Date.now() }
    await this.persist()
  }

  async clearRunningSession(): Promise<void> {
    if (!this.data.interruptedRun) return
    delete this.data.interruptedRun
    await this.persist()
  }

  isSessionArchived(sessionPath: string): boolean {
    const key = sessionPath.replaceAll('\\', '/').toLocaleLowerCase()
    return Boolean(this.data.archivedSessions?.some((item) => item.replaceAll('\\', '/').toLocaleLowerCase() === key))
  }

  async setSessionArchived(sessionPath: string, archived: boolean): Promise<void> {
    const sessions = this.data.archivedSessions ?? []
    const key = sessionPath.replaceAll('\\', '/').toLocaleLowerCase()
    this.data.archivedSessions = sessions.filter((item) => item.replaceAll('\\', '/').toLocaleLowerCase() !== key)
    if (archived) this.data.archivedSessions.push(sessionPath)
    await this.persist()
  }

  async consumeInterruptedRun(): Promise<PersistedSettings['interruptedRun']> {
    const interrupted = this.data.interruptedRun
    if (!interrupted) return undefined
    delete this.data.interruptedRun
    await this.persist()
    return interrupted
  }

  getModelPreference(): { modelKey?: string; thinkingLevel?: string } {
    return {
      modelKey: this.data.modelKey,
      thinkingLevel: this.data.thinkingLevel,
    }
  }

  async setModelPreference(modelKey: string, thinkingLevel: string): Promise<void> {
    this.data.modelKey = modelKey
    this.data.thinkingLevel = thinkingLevel
    await this.persist()
  }

  readProviderKeys(): Record<string, string> {
    if (!safeStorage.isEncryptionAvailable()) return {}

    return Object.fromEntries(
      Object.entries(this.data.providerKeys ?? {}).flatMap(([provider, encoded]) => {
        try {
          return [[provider, safeStorage.decryptString(Buffer.from(encoded, 'base64'))]]
        } catch {
          return []
        }
      }),
    )
  }

  async saveProviderKey(providerId: string, apiKey: string): Promise<boolean> {
    if (!safeStorage.isEncryptionAvailable()) return false

    this.data.providerKeys ??= {}
    this.data.providerKeys[providerId] = safeStorage.encryptString(apiKey).toString('base64')
    await this.persist()
    return true
  }

  async deleteProviderKey(providerId: string): Promise<void> {
    if (!this.data.providerKeys?.[providerId]) return
    delete this.data.providerKeys[providerId]
    await this.persist()
  }

  private async persist(): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true })
    await writeFile(this.filePath, `${JSON.stringify(this.data, null, 2)}\n`, 'utf8')
  }
}
