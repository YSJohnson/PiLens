import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  createAgentSession,
  DefaultPackageManager,
  getAgentDir,
  ModelRuntime,
  SessionManager,
  type AgentSession,
  type AgentSessionEvent,
  type ResolvedResource,
  type SessionEntry,
  type SessionInfo,
} from '@earendil-works/pi-coding-agent'
import type {
  AutoNamingMode,
  DesktopEvent,
  CustomModelApi,
  CustomModelConfig,
  CompactionState,
  ModelOption,
  ProviderOption,
  ResourceCatalog,
  ResourceKind,
  ResourceTemplateInput,
  ResourceToggleRequest,
  SessionForkPoint,
  SessionStats,
  SessionSummary,
  ThinkingLevel,
  ToolRun,
  UiMessage,
} from '../src/shared/contracts'
import { normalizeGeneratedSessionTitle, provisionalSessionTitle } from '../src/shared/session-title'
import { getTopLevelResourcePattern, updatePackageResourcePatterns, updateTopLevelResourcePatterns } from './resource-config'
import type { SettingsStore } from './settings-store'

interface CoreSnapshot {
  sessionId?: string
  sessionFile?: string
  sessionName?: string
  messages: UiMessage[]
  sessions: SessionSummary[]
  forkPoints: SessionForkPoint[]
  modelKey?: string
  thinkingLevel: ThinkingLevel
  streaming: boolean
  stats: SessionStats
  compaction: CompactionState
}

type LoginInteraction = Parameters<ModelRuntime['login']>[2]
type RuntimeAuthPrompt = Parameters<LoginInteraction['prompt']>[0]
type RuntimeAuthEvent = Parameters<LoginInteraction['notify']>[0]

interface ModelsDocument {
  providers?: Record<string, Record<string, unknown>>
  [key: string]: unknown
}

const CUSTOM_MODEL_APIS = new Set<CustomModelApi>([
  'openai-completions',
  'openai-responses',
  'anthropic-messages',
  'google-generative-ai',
])
const LOCAL_API_KEY_MARKER = 'pi-desktop-local'

const THINKING_LEVELS: ThinkingLevel[] = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
const TOOL_LABELS: Record<string, string> = {
  read: '读取文件',
  write: '写入文件',
  edit: '编辑文件',
  bash: '执行命令',
  powershell: '执行 PowerShell',
  grep: '搜索内容',
  find: '查找文件',
  ls: '列出目录',
}

function modelKey(provider: string, id: string): string {
  return `${provider}/${id}`
}

function contentToText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const block = item as Record<string, unknown>
      if (block.type === 'text' && typeof block.text === 'string') return [block.text]
      if (block.type === 'thinking' && typeof block.thinking === 'string') return [block.thinking]
      return []
    })
    .join('\n')
}

function resultToText(result: unknown): string {
  if (!result || typeof result !== 'object') return String(result ?? '')
  const value = result as Record<string, unknown>
  const text = contentToText(value.content)
  if (text) return text
  if ('details' in value) {
    try {
      return JSON.stringify(value.details, null, 2)
    } catch {
      return String(value.details ?? '')
    }
  }
  return ''
}

function safeArgs(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return {}
  try {
    return JSON.parse(JSON.stringify(args)) as Record<string, unknown>
  } catch {
    return { value: String(args) }
  }
}

interface AssistantRunMetadata {
  provider?: string
  model?: string
  timestamp: number
  thinkingLevel?: ThinkingLevel
  durationMs?: number
}

function asThinkingLevel(value: unknown): ThinkingLevel | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLocaleLowerCase() as ThinkingLevel
  return THINKING_LEVELS.includes(normalized) ? normalized : undefined
}

function assistantMetadataKey(provider: unknown, model: unknown, timestamp: unknown): string {
  return `${typeof provider === 'string' ? provider : ''}\u0000${typeof model === 'string' ? model : ''}\u0000${Number(timestamp)}`
}

function assistantRunMetadata(entries: readonly SessionEntry[]): AssistantRunMetadata[] {
  const metadata: AssistantRunMetadata[] = []
  let thinkingLevel: ThinkingLevel | undefined
  let turnStartedAt: number | undefined

  for (const entry of entries) {
    if (entry.type === 'thinking_level_change') {
      thinkingLevel = asThinkingLevel(entry.thinkingLevel) ?? thinkingLevel
      continue
    }
    if (entry.type !== 'message') continue

    const message = entry.message as any
    if (message?.role === 'user') {
      const timestamp = Number(message.timestamp)
      turnStartedAt = Number.isFinite(timestamp) ? timestamp : undefined
      continue
    }
    if (message?.role !== 'assistant') continue

    const timestamp = Number(message.timestamp)
    if (!Number.isFinite(timestamp)) continue
    const completedAt = Date.parse(entry.timestamp)
    const startedAt = turnStartedAt ?? timestamp
    const elapsed = Number.isFinite(completedAt) && completedAt >= startedAt ? completedAt - startedAt : undefined
    metadata.push({
      provider: typeof message.provider === 'string' ? message.provider : undefined,
      model: typeof message.model === 'string' ? message.model : undefined,
      timestamp,
      thinkingLevel: asThinkingLevel(message.providerThinkingLevel) ?? thinkingLevel,
      durationMs: elapsed,
    })
  }

  return metadata
}

function serializeMessages(messages: readonly any[], runMetadata: readonly AssistantRunMetadata[] = []): UiMessage[] {
  const rendered: UiMessage[] = []
  const toolOwners = new Map<string, ToolRun>()
  const metadataQueues = new Map<string, AssistantRunMetadata[]>()

  for (const metadata of runMetadata) {
    const key = assistantMetadataKey(metadata.provider, metadata.model, metadata.timestamp)
    metadataQueues.set(key, [...(metadataQueues.get(key) ?? []), metadata])
  }

  messages.forEach((message, index) => {
    const timestamp = typeof message?.timestamp === 'number' ? message.timestamp : Date.now()
    const id = `persisted-${timestamp}-${index}`

    if (message?.role === 'user') {
      rendered.push({
        id,
        role: 'user',
        content: contentToText(message.content),
        timestamp,
        status: 'complete',
      })
      return
    }

    if (message?.role === 'assistant') {
      const metadata = metadataQueues
        .get(assistantMetadataKey(message.provider, message.model, timestamp))
        ?.shift()
      const text: string[] = []
      const thinking: string[] = []
      const toolRuns: ToolRun[] = []

      for (const block of message.content ?? []) {
        if (block?.type === 'text') text.push(block.text ?? '')
        if (block?.type === 'thinking') thinking.push(block.thinking ?? '')
        if (block?.type === 'toolCall') {
          const tool: ToolRun = {
            id: block.id,
            name: block.name,
            label: TOOL_LABELS[block.name] ?? block.name,
            status: 'queued',
            args: safeArgs(block.arguments),
            output: '',
          }
          toolRuns.push(tool)
          toolOwners.set(block.id, tool)
        }
      }

      rendered.push({
        id,
        role: 'assistant',
        content: text.join(''),
        thinking: thinking.join(''),
        timestamp,
        status: message.stopReason === 'error' ? 'error' : 'complete',
        error: message.errorMessage,
        provider: message.provider,
        model: message.model,
        thinkingLevel: asThinkingLevel(message.providerThinkingLevel) ?? metadata?.thinkingLevel,
        durationMs: metadata?.durationMs,
        toolRuns,
      })
      return
    }

    if (message?.role === 'toolResult') {
      const tool = toolOwners.get(message.toolCallId)
      if (tool) {
        tool.status = message.isError ? 'error' : 'success'
        tool.output = contentToText(message.content)
      }
    }
  })

  return rendered
}

function sessionTitle(info: SessionInfo): string {
  const value = info.name || info.firstMessage || '新任务'
  return value.replaceAll(/\s+/g, ' ').trim().slice(0, 72) || '新任务'
}

export class PiService {
  private runtime?: ModelRuntime
  private session?: AgentSession
  private unsubscribe?: () => void
  private cwd?: string
  private activeAssistantId?: string
  private activeRunStartedAt?: number
  private readonly toolStarts = new Map<string, number>()
  private authFlow?: { id: string; providerId: string; controller: AbortController }
  private pendingAuthPrompt?: {
    flowId: string
    promptId: string
    resolve: (value: string) => void
    reject: (error: Error) => void
    cleanup: () => void
  }
  private pendingAutoTitle?: { sessionId: string; prompt: string; provisional: string }

  constructor(
    private readonly settings: SettingsStore,
    private readonly emit: (event: DesktopEvent) => void,
    private readonly onSettled: () => void,
  ) {}

  get sessionFile(): string | undefined {
    return this.session?.sessionFile
  }

  get isStreaming(): boolean {
    return this.session?.isStreaming ?? false
  }

  async initialize(): Promise<void> {
    this.runtime = await ModelRuntime.create({
      allowModelNetwork: false,
      refreshOnCreate: true,
      signal: AbortSignal.timeout(15_000),
    })

    const storedKeys = this.settings.readProviderKeys()
    await Promise.all(
      Object.entries(storedKeys).map(async ([providerId, apiKey]) => {
        try {
          await this.runtime!.setRuntimeApiKey(providerId, apiKey, { signal: AbortSignal.timeout(10_000) })
        } catch {
          // Keep startup resilient if a previously used provider was removed.
        }
      }),
    )
  }

  async getCatalog(): Promise<{ providers: ProviderOption[]; models: ModelOption[] }> {
    const runtime = this.requireRuntime()
    const providers = runtime.getProviders()
    const providerNames = new Map(providers.map((provider) => [provider.id, provider.name]))

    const providerOptions = providers.map((provider) => {
      const status = runtime.getProviderAuthStatus(provider.id)
      return {
        id: provider.id,
        name: provider.name,
        authenticated: status.configured,
        authLabel: status.label ?? (status.configured ? '已连接' : '需要 API Key 或登录'),
        authMethods: [
          ...(provider.auth.apiKey ? ['api_key' as const] : []),
          ...(provider.auth.oauth ? ['oauth' as const] : []),
        ],
        usingOAuth: runtime.isUsingOAuth(provider.id),
      }
    })

    const available = new Set(runtime.getAvailableSnapshot().map((model) => modelKey(model.provider, model.id)))
    const models = runtime
      .getModels()
      .map((model) => {
        const levels = model.reasoning
          ? THINKING_LEVELS.filter((level) => level === 'off' || model.thinkingLevelMap?.[level as Exclude<ThinkingLevel, 'off'>] !== null)
          : (['off'] as ThinkingLevel[])
        return {
          key: modelKey(model.provider, model.id),
          id: model.id,
          name: model.name,
          provider: model.provider,
          providerName: providerNames.get(model.provider) ?? model.provider,
          authenticated: available.has(modelKey(model.provider, model.id)) || runtime.hasConfiguredAuth(model.provider),
          reasoning: model.reasoning,
          thinkingLevels: levels,
          contextWindow: model.contextWindow,
          maxTokens: model.maxTokens,
        }
      })
      .toSorted((left, right) => {
        if (left.authenticated !== right.authenticated) return left.authenticated ? -1 : 1
        const providerOrder = left.providerName.localeCompare(right.providerName)
        return providerOrder || left.name.localeCompare(right.name)
      })

    return { providers: providerOptions, models }
  }

  async refreshModels(): Promise<{ providers: ProviderOption[]; models: ModelOption[] }> {
    await this.requireRuntime().refresh({
      allowNetwork: true,
      force: true,
      signal: AbortSignal.timeout(25_000),
    })
    const catalog = await this.getCatalog()
    this.emit({ type: 'models:update', ...catalog })
    return catalog
  }

  async getResources(): Promise<ResourceCatalog> {
    const loader = this.session?.resourceLoader
    const session = this.session
    if (!loader || !session || !this.cwd) return { skills: [], plugins: [], packages: [], issues: [] }

    const skillResult = loader.getSkills()
    const extensionResult = loader.getExtensions()
    const packageManager = new DefaultPackageManager({
      cwd: this.cwd,
      agentDir: getAgentDir(),
      settingsManager: session.settingsManager,
    })
    let resolvedSkills: ResolvedResource[] = []
    let resolvedPlugins: ResolvedResource[] = []
    const resolutionIssues: ResourceCatalog['issues'] = []
    try {
      const resolved = await packageManager.resolve(async () => 'skip')
      resolvedSkills = resolved.skills
      resolvedPlugins = resolved.extensions
    } catch (error) {
      resolutionIssues.push({
        type: 'error',
        message: `无法读取资源配置：${error instanceof Error ? error.message : String(error)}`,
      })
    }

    const loadedSkills = new Map(skillResult.skills.map((skill) => [path.resolve(skill.filePath), skill]))
    const loadedPlugins = new Map(extensionResult.extensions.map((extension) => [path.resolve(extension.resolvedPath || extension.path), extension]))
    const skillPaths = new Set([...resolvedSkills.map((resource) => path.resolve(resource.path)), ...loadedSkills.keys()])
    const pluginPaths = new Set([...resolvedPlugins.map((resource) => path.resolve(resource.path)), ...loadedPlugins.keys()])
    const resolvedSkillByPath = new Map(resolvedSkills.map((resource) => [path.resolve(resource.path), resource]))
    const resolvedPluginByPath = new Map(resolvedPlugins.map((resource) => [path.resolve(resource.path), resource]))

    const skills = await Promise.all([...skillPaths].map(async (resourcePath) => {
      const loaded = loadedSkills.get(resourcePath)
      const resolved = resolvedSkillByPath.get(resourcePath)
      const metadata = loaded?.sourceInfo ?? resolved?.metadata
      const fallback = await this.readSkillSummary(resourcePath)
      return {
        name: loaded?.name ?? fallback.name,
        description: loaded?.description ?? fallback.description,
        path: resourcePath,
        source: metadata?.source ?? 'dynamic',
        scope: metadata?.scope ?? 'temporary',
        origin: metadata?.origin ?? 'top-level',
        baseDir: metadata?.baseDir,
        enabled: resolved?.enabled ?? Boolean(loaded),
        manageable: Boolean(resolved && metadata?.scope !== 'temporary'),
        explicitOnly: loaded?.disableModelInvocation ?? fallback.explicitOnly,
      }
    }))

    const plugins = [...pluginPaths].map((resourcePath) => {
      const loaded = loadedPlugins.get(resourcePath)
      const resolved = resolvedPluginByPath.get(resourcePath)
      const metadata = loaded?.sourceInfo ?? resolved?.metadata
      return {
        name: path.basename(resourcePath, path.extname(resourcePath)),
        path: resourcePath,
        source: metadata?.source ?? 'dynamic',
        scope: metadata?.scope ?? 'temporary',
        origin: metadata?.origin ?? 'top-level',
        baseDir: metadata?.baseDir,
        enabled: resolved?.enabled ?? Boolean(loaded),
        manageable: Boolean(resolved && metadata?.scope !== 'temporary'),
        hidden: loaded?.hidden ?? false,
        tools: loaded ? [...loaded.tools.keys()].toSorted() : [],
        commands: loaded ? [...loaded.commands.keys()].toSorted() : [],
        shortcuts: loaded?.shortcuts.size ?? 0,
      }
    })

    return {
      skills: skills.toSorted((left, right) => Number(right.enabled) - Number(left.enabled) || left.name.localeCompare(right.name)),
      plugins: plugins.toSorted((left, right) => Number(right.enabled) - Number(left.enabled) || left.name.localeCompare(right.name)),
      packages: packageManager.listConfiguredPackages().toSorted((left, right) => left.source.localeCompare(right.source)),
      issues: [
        ...skillResult.diagnostics.map((issue) => ({ type: issue.type, message: issue.message, path: issue.path })),
        ...extensionResult.errors.map((issue) => ({ type: 'error' as const, message: issue.error, path: issue.path })),
        ...resolutionIssues,
      ],
    }
  }

  async reloadResources(): Promise<ResourceCatalog> {
    const session = this.requireSession()
    if (session.isStreaming) throw new Error('Pi 正在运行，请等待当前回复完成后再重载资源。')
    await session.reload()
    return this.getResources()
  }

  async resolveResourcePath(requestedPath: string): Promise<string> {
    const requested = path.resolve(requestedPath)
    const resources = await this.getResources()
    const allowed = [
      ...resources.skills.map((skill) => skill.path),
      ...resources.plugins.map((plugin) => plugin.path),
      ...resources.issues.flatMap((issue) => issue.path ? [issue.path] : []),
    ].map((resourcePath) => path.resolve(resourcePath))
    if (!allowed.some((resourcePath) => resourcePath === requested)) throw new Error('该路径不属于当前 Pi 资源目录。')
    return requested
  }

  async setResourceEnabled(request: ResourceToggleRequest): Promise<ResourceCatalog> {
    const session = this.requireIdleSessionForResources()
    if (!request.manageable || request.scope === 'temporary') throw new Error('这个动态资源不能在设置中启停。')
    const manager = session.settingsManager
    const projectScope = request.scope === 'project'
    const currentSettings = projectScope ? manager.getProjectSettings() : manager.getGlobalSettings()

    if (request.origin === 'package') {
      const packages = updatePackageResourcePatterns([...(currentSettings.packages ?? [])], request)
      if (projectScope) manager.setProjectPackages(packages)
      else manager.setPackages(packages)
    } else {
      const key = request.kind === 'skill' ? 'skills' : 'extensions'
      const pattern = getTopLevelResourcePattern(request, this.cwd!, getAgentDir())
      const updated = updateTopLevelResourcePatterns([...(currentSettings[key] ?? [])], pattern, request.enabled)
      this.setTopLevelResourcePaths(manager, request.kind, request.scope, updated)
    }

    await manager.flush()
    await session.reload()
    return this.getResources()
  }

  async installResourcePackage(source: string, scope: 'user' | 'project'): Promise<ResourceCatalog> {
    const normalized = source.trim()
    if (!normalized) throw new Error('请输入 npm、Git 或本地资源地址。')
    const session = this.requireIdleSessionForResources()
    const packageManager = this.createPackageManager(session)
    this.attachPackageProgress(packageManager)
    try {
      await packageManager.installAndPersist(normalized, { local: scope === 'project' })
      await session.settingsManager.flush()
      await session.reload()
      return await this.getResources()
    } finally {
      packageManager.setProgressCallback(undefined)
      this.emit({ type: 'resources:progress', progress: undefined })
    }
  }

  async removeResourcePackage(source: string, scope: 'user' | 'project'): Promise<ResourceCatalog> {
    const session = this.requireIdleSessionForResources()
    const packageManager = this.createPackageManager(session)
    this.attachPackageProgress(packageManager)
    try {
      const removed = await packageManager.removeAndPersist(source, { local: scope === 'project' })
      if (!removed) throw new Error(`找不到资源包 ${source}。`)
      await session.settingsManager.flush()
      await session.reload()
      return await this.getResources()
    } finally {
      packageManager.setProgressCallback(undefined)
      this.emit({ type: 'resources:progress', progress: undefined })
    }
  }

  async updateResourcePackage(source?: string): Promise<ResourceCatalog> {
    const session = this.requireIdleSessionForResources()
    const packageManager = this.createPackageManager(session)
    this.attachPackageProgress(packageManager)
    try {
      await packageManager.update(source)
      await session.reload()
      return await this.getResources()
    } finally {
      packageManager.setProgressCallback(undefined)
      this.emit({ type: 'resources:progress', progress: undefined })
    }
  }

  async createResourceTemplate(input: ResourceTemplateInput): Promise<ResourceCatalog> {
    const session = this.requireIdleSessionForResources()
    const name = input.name.trim().toLowerCase()
    if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u.test(name) || name.includes('--')) {
      throw new Error('名称只能包含小写字母、数字和单个连字符，最多 64 个字符。')
    }
    const description = input.description.trim() || `${name} 的 Pi ${input.kind === 'skill' ? 'Skill' : 'Plugin'}`
    const root = input.scope === 'project' ? path.join(this.cwd!, '.pi') : getAgentDir()
    const target = input.kind === 'skill'
      ? path.join(root, 'skills', name, 'SKILL.md')
      : path.join(root, 'extensions', `${name}.ts`)
    const content = input.kind === 'skill'
      ? this.createSkillTemplate(name, description)
      : this.createPluginTemplate(name, description)

    await mkdir(path.dirname(target), { recursive: true })
    try {
      await writeFile(target, content, { encoding: 'utf8', flag: 'wx' })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error(`${name} 已存在，请换一个名称。`, { cause: error })
      throw error
    }
    await session.reload()
    return this.getResources()
  }

  async saveProviderKey(providerId: string, apiKey: string, remember: boolean): Promise<{ providers: ProviderOption[]; models: ModelOption[] }> {
    const normalizedKey = apiKey.trim()
    if (!normalizedKey) throw new Error('API Key 不能为空。')
    await this.requireRuntime().setRuntimeApiKey(providerId, normalizedKey, { signal: AbortSignal.timeout(15_000) })
    if (remember) {
      const stored = await this.settings.saveProviderKey(providerId, normalizedKey)
      if (!stored) throw new Error('系统凭据加密当前不可用，无法安全保存 API Key。你可以取消“记住此密钥”后仅在本次运行中使用。')
    } else {
      await this.settings.deleteProviderKey(providerId)
    }
    return this.getCatalog()
  }

  async loginProvider(providerId: string): Promise<{ providers: ProviderOption[]; models: ModelOption[] }> {
    const runtime = this.requireRuntime()
    const provider = runtime.getProvider(providerId)
    if (!provider?.auth.oauth) throw new Error(`${provider?.name ?? providerId} 不支持 OAuth 登录。`)
    if (this.authFlow) throw new Error('已有一个登录流程正在进行。')

    const flowId = randomUUID()
    const controller = new AbortController()
    this.authFlow = { id: flowId, providerId, controller }
    this.emit({ type: 'auth:start', flow: { id: flowId, providerId, providerName: provider.name, notices: [] } })

    try {
      await runtime.login(providerId, 'oauth', {
        signal: controller.signal,
        prompt: (prompt) => this.requestAuthPrompt(flowId, prompt),
        notify: (event) => this.notifyAuthEvent(flowId, event),
      })
      const catalog = await this.getCatalog()
      this.emit({ type: 'models:update', ...catalog })
      this.emit({ type: 'auth:complete', flowId, success: true, message: `${provider.name} 已连接。` })
      return catalog
    } catch (error) {
      const message = controller.signal.aborted
        ? '登录已取消。'
        : error instanceof Error ? error.message : String(error)
      this.emit({ type: 'auth:complete', flowId, success: false, message })
      throw new Error(message, { cause: error })
    } finally {
      this.rejectPendingAuthPrompt(flowId, new Error('登录流程已结束。'))
      if (this.authFlow?.id === flowId) this.authFlow = undefined
    }
  }

  answerAuthPrompt(flowId: string, promptId: string, value?: string): void {
    const pending = this.pendingAuthPrompt
    if (!pending || pending.flowId !== flowId || pending.promptId !== promptId) throw new Error('登录问题已失效。')
    pending.cleanup()
    this.pendingAuthPrompt = undefined
    if (value === undefined) pending.reject(new Error('登录已取消。'))
    else pending.resolve(value)
  }

  cancelProviderLogin(flowId: string): void {
    if (this.authFlow?.id !== flowId) return
    this.authFlow.controller.abort()
    this.rejectPendingAuthPrompt(flowId, new Error('登录已取消。'))
  }

  async disconnectProvider(providerId: string): Promise<{ providers: ProviderOption[]; models: ModelOption[] }> {
    const runtime = this.requireRuntime()
    await this.settings.deleteProviderKey(providerId)
    await runtime.removeRuntimeApiKey(providerId, { signal: AbortSignal.timeout(10_000) })
    await runtime.logout(providerId, { signal: AbortSignal.timeout(10_000) })
    const catalog = await this.getCatalog()
    this.emit({ type: 'models:update', ...catalog })
    return catalog
  }

  async getCustomModels(): Promise<CustomModelConfig[]> {
    const document = await this.readModelsDocument()
    return Object.entries(document.providers ?? {}).flatMap(([providerId, provider]) => {
      const providerModels = Array.isArray(provider.models) ? provider.models : []
      return providerModels.flatMap((rawModel) => {
        if (!rawModel || typeof rawModel !== 'object' || Array.isArray(rawModel)) return []
        const model = rawModel as Record<string, unknown>
        const id = typeof model.id === 'string' ? model.id : ''
        const apiValue = typeof model.api === 'string' ? model.api : provider.api
        if (!id || typeof apiValue !== 'string' || !CUSTOM_MODEL_APIS.has(apiValue as CustomModelApi)) return []
        const compat = model.compat && typeof model.compat === 'object' && !Array.isArray(model.compat)
          ? model.compat as Record<string, unknown>
          : provider.compat && typeof provider.compat === 'object' && !Array.isArray(provider.compat)
            ? provider.compat as Record<string, unknown>
            : {}
        const input = Array.isArray(model.input) ? model.input : []
        return [{
          providerId,
          providerName: typeof provider.name === 'string' ? provider.name : providerId,
          baseUrl: typeof model.baseUrl === 'string' ? model.baseUrl : typeof provider.baseUrl === 'string' ? provider.baseUrl : '',
          api: apiValue as CustomModelApi,
          modelId: id,
          modelName: typeof model.name === 'string' ? model.name : id,
          contextWindow: typeof model.contextWindow === 'number' ? model.contextWindow : 128_000,
          maxTokens: typeof model.maxTokens === 'number' ? model.maxTokens : 8_192,
          reasoning: model.reasoning === true,
          imageInput: input.includes('image'),
          localNoAuth: provider.apiKey === LOCAL_API_KEY_MARKER,
          compatibilityMode: compat.supportsDeveloperRole === false || compat.supportsReasoningEffort === false,
        }]
      })
    }).toSorted((left, right) => left.providerName.localeCompare(right.providerName) || left.modelName.localeCompare(right.modelName))
  }

  async saveCustomModel(input: CustomModelConfig): Promise<{
    customModels: CustomModelConfig[]
    providers: ProviderOption[]
    models: ModelOption[]
  }> {
    const model = this.validateCustomModel(input)
    const runtime = this.requireRuntime()
    if (runtime.getRegisteredNativeProvider(model.providerId)) throw new Error('Provider ID 与 Pi 内置 Provider 冲突，请使用独立 ID。')

    const document = await this.readModelsDocument()
    document.providers ??= {}
    const previousProvider = document.providers[model.providerId] ?? {}
    const previousModels = Array.isArray(previousProvider.models) ? previousProvider.models : []
    const previousModel = previousModels.find((item) => item && typeof item === 'object' && !Array.isArray(item) && (item as Record<string, unknown>).id === model.modelId)
    const previousRecord = previousModel && typeof previousModel === 'object' && !Array.isArray(previousModel)
      ? previousModel as Record<string, unknown>
      : {}
    const previousCompat = previousRecord.compat && typeof previousRecord.compat === 'object' && !Array.isArray(previousRecord.compat)
      ? previousRecord.compat as Record<string, unknown>
      : {}
    const modelRecord: Record<string, unknown> = {
      ...previousRecord,
      id: model.modelId,
      name: model.modelName,
      reasoning: model.reasoning,
      input: model.imageInput ? ['text', 'image'] : ['text'],
      contextWindow: model.contextWindow,
      maxTokens: model.maxTokens,
      cost: previousRecord.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    }
    if (model.api.startsWith('openai-')) {
      modelRecord.compat = {
        ...previousCompat,
        supportsDeveloperRole: !model.compatibilityMode,
        supportsReasoningEffort: !model.compatibilityMode,
      }
    }
    const nextModels = [
      ...previousModels.filter((item) => !item || typeof item !== 'object' || Array.isArray(item) || (item as Record<string, unknown>).id !== model.modelId),
      modelRecord,
    ]
    const nextProvider: Record<string, unknown> = {
      ...previousProvider,
      name: model.providerName,
      baseUrl: model.baseUrl,
      api: model.api,
      models: nextModels,
    }
    if (model.localNoAuth) nextProvider.apiKey = LOCAL_API_KEY_MARKER
    else if (nextProvider.apiKey === LOCAL_API_KEY_MARKER) delete nextProvider.apiKey
    document.providers[model.providerId] = nextProvider

    await this.writeModelsDocument(document)
    await runtime.refresh({ allowNetwork: false, force: true, signal: AbortSignal.timeout(15_000) })
    const catalog = await this.getCatalog()
    this.emit({ type: 'models:update', ...catalog })
    return { customModels: await this.getCustomModels(), ...catalog }
  }

  async deleteCustomModel(providerId: string, modelId: string): Promise<{
    customModels: CustomModelConfig[]
    providers: ProviderOption[]
    models: ModelOption[]
  }> {
    const document = await this.readModelsDocument()
    const provider = document.providers?.[providerId]
    if (!provider || !Array.isArray(provider.models)) throw new Error('找不到这个自定义模型。')
    const nextModels = provider.models.filter((item) => !item || typeof item !== 'object' || Array.isArray(item) || (item as Record<string, unknown>).id !== modelId)
    if (nextModels.length === provider.models.length) throw new Error('找不到这个自定义模型。')
    provider.models = nextModels
    await this.writeModelsDocument(document)
    await this.requireRuntime().refresh({ allowNetwork: false, force: true, signal: AbortSignal.timeout(15_000) })
    const catalog = await this.getCatalog()
    this.emit({ type: 'models:update', ...catalog })
    return { customModels: await this.getCustomModels(), ...catalog }
  }

  async createSession(cwd: string): Promise<void> {
    if (this.isStreaming) throw new Error('Pi 正在运行，请等待当前回复完成后再新建会话。')
    await this.activate(cwd, SessionManager.create(cwd))
  }

  async openSession(cwd: string, sessionFile: string): Promise<void> {
    if (this.isStreaming) throw new Error('Pi 正在运行，请等待当前回复完成后再切换会话。')
    await this.activate(cwd, SessionManager.open(sessionFile, undefined, cwd))
  }

  async openMostRecentOrCreate(cwd: string): Promise<void> {
    const sessions = await SessionManager.list(cwd)
    if (sessions[0]) await this.openSession(cwd, sessions[0].path)
    else await this.createSession(cwd)
  }

  async sendPrompt(text: string, behavior?: 'steer' | 'followUp', autoNamingMode: AutoNamingMode = 'smart'): Promise<void> {
    const session = this.requireSession()
    const prompt = text.trim()
    if (!prompt) return

    if (!session.sessionName && autoNamingMode !== 'off') {
      const provisional = provisionalSessionTitle(prompt)
      session.setSessionName(provisional)
      if (autoNamingMode === 'smart') {
        this.pendingAutoTitle = { sessionId: session.sessionId, prompt, provisional }
      }
    }

    void session
      .prompt(prompt, session.isStreaming ? { streamingBehavior: behavior ?? 'followUp' } : undefined)
      .catch((error: unknown) => {
        this.emit({
          type: 'app:error',
          title: 'Pi 无法完成请求',
          message: error instanceof Error ? error.message : String(error),
        })
        this.emit({ type: 'agent:status', streaming: false })
        this.onSettled()
      })
  }

  async abort(): Promise<void> {
    if (this.session?.isStreaming) await this.session.abort()
  }

  async setModel(key: string, thinkingLevel: ThinkingLevel): Promise<void> {
    if (this.isStreaming) throw new Error('Pi 正在运行，请等待当前回复完成后再切换模型。')
    const [provider, ...modelParts] = key.split('/')
    const model = this.requireRuntime().getModel(provider, modelParts.join('/'))
    if (!model) throw new Error(`找不到模型 ${key}。`)

    if (this.session) {
      await this.session.setModel(model)
      this.session.setThinkingLevel(thinkingLevel)
    }
    await this.settings.setModelPreference(key, thinkingLevel)
  }

  renameSession(name: string): void {
    this.requireSession().setSessionName(name.trim() || '新任务')
  }

  async branchSession(entryId: string): Promise<string> {
    const session = this.requireSession()
    if (session.isStreaming) throw new Error('Pi 正在运行，请等待当前回复完成后再创建分支。')
    const entry = session.sessionManager.getEntry(entryId)
    if (entry?.type !== 'message' || entry.message.role !== 'user') throw new Error('找不到可分支的历史消息。')
    const result = await session.navigateTree(entryId, { summarize: false })
    if (result.cancelled) throw new Error('分支操作已取消。')
    return result.editorText ?? contentToText(entry.message.content)
  }

  async forkSession(entryId: string): Promise<string> {
    const session = this.requireSession()
    const cwd = this.cwd
    if (!cwd) throw new Error('请先选择项目。')
    if (session.isStreaming) throw new Error('Pi 正在运行，请等待当前回复完成后再 Fork。')

    const entry = session.sessionManager.getEntry(entryId)
    if (entry?.type !== 'message' || entry.message.role !== 'user') throw new Error('找不到可 Fork 的历史消息。')
    const sourceFile = session.sessionFile
    if (!sourceFile) throw new Error('当前会话尚未保存，请等待第一条回复完成后再 Fork。')

    const sessionDirectory = session.sessionManager.getSessionDir()
    let forkedManager: SessionManager
    if (entry.parentId === null) {
      forkedManager = SessionManager.create(cwd, sessionDirectory)
      forkedManager.newSession({ parentSession: sourceFile })
    } else {
      forkedManager = SessionManager.open(sourceFile, sessionDirectory, cwd)
      const forkedPath = forkedManager.createBranchedSession(entry.parentId)
      if (!forkedPath) throw new Error('无法创建独立会话。')
    }

    await this.activate(cwd, forkedManager)
    return contentToText(entry.message.content)
  }

  async compactSession(): Promise<void> {
    const session = this.requireSession()
    if (session.isStreaming) throw new Error('Pi 正在运行，请在当前回复完成后再压缩上下文。')
    await session.compact()
  }

  async snapshot(): Promise<CoreSnapshot> {
    const session = this.session
    const thinkingPreference = this.settings.getModelPreference().thinkingLevel as ThinkingLevel | undefined
    if (!session || !this.cwd) {
      return {
        messages: [],
        sessions: [],
        forkPoints: [],
        thinkingLevel: thinkingPreference ?? 'medium',
        streaming: false,
        stats: this.emptyStats(),
        compaction: { active: false, count: 0 },
      }
    }

    const [sessions, stats] = await Promise.all([SessionManager.list(this.cwd), Promise.resolve(session.getSessionStats())])
    const context = stats.contextUsage
    const activeEntryIds = new Set(session.sessionManager.getBranch().map((entry) => entry.id))
    const forkPoints = session.getUserMessagesForForking()
      .filter((point) => activeEntryIds.has(point.entryId))
      .map((point) => {
        const entry = session.sessionManager.getEntry(point.entryId)
        const timestamp = entry ? new Date(entry.timestamp).getTime() : Date.now()
        return { ...point, timestamp: Number.isFinite(timestamp) ? timestamp : Date.now() }
      })
    return {
      sessionId: session.sessionId,
      sessionFile: session.sessionFile,
      sessionName: session.sessionName,
      messages: serializeMessages(session.messages, assistantRunMetadata(session.sessionManager.getBranch())),
      sessions: sessions.map((info) => ({
        id: info.id,
        path: info.path,
        title: sessionTitle(info),
        projectPath: info.cwd,
        createdAt: info.created.getTime(),
        updatedAt: info.modified.getTime(),
        messageCount: info.messageCount,
        active: info.path === session.sessionFile,
        streaming: info.path === session.sessionFile && session.isStreaming,
      })),
      forkPoints,
      modelKey: session.model ? modelKey(session.model.provider, session.model.id) : undefined,
      thinkingLevel: session.thinkingLevel,
      streaming: session.isStreaming,
      stats: {
        inputTokens: stats.tokens.input,
        outputTokens: stats.tokens.output,
        cacheReadTokens: stats.tokens.cacheRead,
        totalTokens: stats.tokens.total,
        cost: stats.cost,
        contextTokens: context?.tokens ?? null,
        contextWindow: context?.contextWindow ?? session.model?.contextWindow ?? 0,
        contextPercent: context?.percent ?? null,
      },
      compaction: this.getCompactionState(),
    }
  }

  dispose(): void {
    this.unsubscribe?.()
    this.unsubscribe = undefined
    this.session?.dispose()
    this.session = undefined
    this.pendingAutoTitle = undefined
  }

  private async activate(cwd: string, sessionManager: SessionManager): Promise<void> {
    const runtime = this.requireRuntime()
    const preference = this.settings.getModelPreference()
    const [provider, ...modelParts] = preference.modelKey?.split('/') ?? []
    const preferredModel = provider ? runtime.getModel(provider, modelParts.join('/')) : undefined
    const available = runtime.getAvailableSnapshot()
    const model = preferredModel ?? available[0]
    const requestedThinking = (preference.thinkingLevel as ThinkingLevel | undefined) ?? 'medium'

    this.dispose()
    this.cwd = cwd
    const result = await createAgentSession({
      cwd,
      modelRuntime: runtime,
      model,
      thinkingLevel: requestedThinking,
      sessionManager,
      tools: process.platform === 'win32'
        ? ['read', 'powershell', 'edit', 'write', 'grep', 'find', 'ls']
        : ['read', 'bash', 'edit', 'write', 'grep', 'find', 'ls'],
    })
    this.session = result.session
    this.subscribeToSession(result.session)

    if (result.modelFallbackMessage) {
      this.emit({ type: 'app:error', title: '模型已回退', message: result.modelFallbackMessage })
    }
  }

  private subscribeToSession(session: AgentSession): void {
    this.unsubscribe = session.subscribe((event) => this.handleEvent(event))
  }

  private handleEvent(event: AgentSessionEvent): void {
    switch (event.type) {
      case 'agent_start':
        this.activeRunStartedAt = Date.now()
        this.emit({ type: 'agent:status', streaming: true })
        break
      case 'message_start': {
        const message = event.message as any
        if (message.role !== 'assistant') break
        this.activeAssistantId = randomUUID()
        const timestamp = typeof message.timestamp === 'number' ? message.timestamp : Date.now()
        this.emit({
          type: 'message:start',
          message: {
            id: this.activeAssistantId,
            role: 'assistant',
            content: '',
            thinking: '',
            timestamp,
            status: 'streaming',
            provider: message.provider ?? this.session?.model?.provider,
            model: message.model,
            thinkingLevel: asThinkingLevel(message.providerThinkingLevel) ?? this.session?.thinkingLevel,
            toolRuns: [],
          },
        })
        break
      }
      case 'message_update': {
        const update = event.assistantMessageEvent
        if (!this.activeAssistantId) break
        if (update.type === 'text_delta') {
          this.emit({ type: 'message:delta', messageId: this.activeAssistantId, delta: update.delta, channel: 'text' })
        }
        if (update.type === 'thinking_delta') {
          this.emit({ type: 'message:delta', messageId: this.activeAssistantId, delta: update.delta, channel: 'thinking' })
        }
        break
      }
      case 'tool_execution_start': {
        const messageId = this.activeAssistantId ?? randomUUID()
        this.activeAssistantId = messageId
        const startedAt = Date.now()
        this.toolStarts.set(event.toolCallId, startedAt)
        this.emit({
          type: 'tool:start',
          messageId,
          tool: {
            id: event.toolCallId,
            name: event.toolName,
            label: TOOL_LABELS[event.toolName] ?? event.toolName,
            status: 'running',
            args: safeArgs(event.args),
            output: '',
            startedAt,
          },
        })
        break
      }
      case 'tool_execution_update':
        this.emit({
          type: 'tool:update',
          messageId: this.activeAssistantId ?? '',
          toolId: event.toolCallId,
          output: resultToText(event.partialResult),
        })
        break
      case 'tool_execution_end': {
        const startedAt = this.toolStarts.get(event.toolCallId)
        const endedTool: ToolRun = {
          id: event.toolCallId,
          name: event.toolName,
          label: TOOL_LABELS[event.toolName] ?? event.toolName,
          status: event.isError ? 'error' : 'success',
          args: {},
          output: resultToText(event.result),
          startedAt,
          durationMs: startedAt ? Date.now() - startedAt : undefined,
        }
        this.emit({ type: 'tool:end', messageId: this.activeAssistantId ?? '', tool: endedTool })
        this.toolStarts.delete(event.toolCallId)
        break
      }
      case 'message_end': {
        const message = event.message as any
        if (message.role !== 'assistant' || !this.activeAssistantId) break
        const serialized = serializeMessages([message])[0]
        if (serialized) {
          serialized.id = this.activeAssistantId
          serialized.provider ??= message.provider ?? this.session?.model?.provider
          serialized.thinkingLevel = asThinkingLevel(message.providerThinkingLevel) ?? serialized.thinkingLevel ?? this.session?.thinkingLevel
          const startedAt = this.activeRunStartedAt ?? (typeof message.timestamp === 'number' ? message.timestamp : undefined)
          serialized.durationMs = startedAt === undefined ? undefined : Math.max(0, Date.now() - startedAt)
          this.emit({ type: 'message:end', messageId: this.activeAssistantId, message: serialized })
        }
        break
      }
      case 'agent_settled': {
        const pendingTitle = this.pendingAutoTitle
        this.pendingAutoTitle = undefined
        this.emit({ type: 'agent:status', streaming: false })
        this.activeAssistantId = undefined
        this.activeRunStartedAt = undefined
        this.onSettled()
        if (pendingTitle) void this.generateSessionTitle(pendingTitle)
        break
      }
      case 'compaction_start':
        this.emit({ type: 'compaction:status', compaction: { ...this.getCompactionState(), active: true, reason: event.reason } })
        break
      case 'compaction_end':
        this.emit({ type: 'compaction:status', compaction: { ...this.getCompactionState(), active: false, reason: event.reason } })
        break
      case 'auto_retry_start':
        this.emit({
          type: 'app:error',
          title: `正在重试 ${event.attempt}/${event.maxAttempts}`,
          message: event.errorMessage,
        })
        break
      default:
        break
    }
  }

  private async generateSessionTitle(pending: { sessionId: string; prompt: string; provisional: string }): Promise<void> {
    const session = this.session
    const runtime = this.runtime
    const model = session?.model
    if (!session || !runtime || !model || session.sessionId !== pending.sessionId) return

    const answer = session.getLastAssistantText()?.slice(0, 1800) ?? ''
    try {
      const response = await runtime.completeSimple(
        model,
        {
          systemPrompt: '为编程助手会话生成简洁、具体的标题。使用用户请求的语言，只返回标题，不要引号、Markdown 或解释。中文最多 18 个汉字，其他语言最多 48 个字符。',
          messages: [{
            role: 'user',
            content: `用户请求：\n${pending.prompt.slice(0, 1800)}\n\n助手处理摘要：\n${answer}`,
            timestamp: Date.now(),
          }],
        },
        {
          maxTokens: 48,
          reasoning: 'minimal',
          temperature: 0.2,
          signal: AbortSignal.timeout(20_000),
        },
      )
      const generated = normalizeGeneratedSessionTitle(contentToText(response.content), pending.provisional)
      if (this.session !== session || session.sessionId !== pending.sessionId || session.sessionName !== pending.provisional) return
      if (generated === pending.provisional) return
      session.setSessionName(generated)
      this.emit({ type: 'session:name', sessionId: pending.sessionId, name: generated })
    } catch {
      // Keep the useful provisional title if the lightweight naming request is unavailable.
    }
  }

  private createPackageManager(session: AgentSession): DefaultPackageManager {
    return new DefaultPackageManager({
      cwd: this.cwd!,
      agentDir: getAgentDir(),
      settingsManager: session.settingsManager,
    })
  }

  private attachPackageProgress(packageManager: DefaultPackageManager): void {
    packageManager.setProgressCallback((event) => {
      this.emit({
        type: 'resources:progress',
        progress: {
          action: event.action,
          source: event.source,
          message: event.message ?? `${event.action} ${event.source}`,
        },
      })
    })
  }

  private requireIdleSessionForResources(): AgentSession {
    const session = this.requireSession()
    if (session.isStreaming) throw new Error('Pi 正在运行，请等待当前回复完成后再管理资源。')
    return session
  }

  private setTopLevelResourcePaths(
    manager: AgentSession['settingsManager'],
    kind: ResourceKind,
    scope: 'user' | 'project',
    paths: string[],
  ): void {
    if (kind === 'skill') {
      if (scope === 'project') manager.setProjectSkillPaths(paths)
      else manager.setSkillPaths(paths)
      return
    }
    if (scope === 'project') manager.setProjectExtensionPaths(paths)
    else manager.setExtensionPaths(paths)
  }

  private async readSkillSummary(resourcePath: string): Promise<{ name: string; description: string; explicitOnly: boolean }> {
    const fallbackName = path.basename(resourcePath, path.extname(resourcePath)) === 'SKILL'
      ? path.basename(path.dirname(resourcePath))
      : path.basename(resourcePath, path.extname(resourcePath))
    try {
      const content = await readFile(resourcePath, 'utf8')
      const frontmatter = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/u)?.[1] ?? ''
      const name = frontmatter.match(/^name:\s*["']?(.+?)["']?\s*$/mu)?.[1]?.trim() || fallbackName
      const description = frontmatter.match(/^description:\s*["']?(.+?)["']?\s*$/mu)?.[1]?.trim() || '此 Skill 没有提供描述。'
      const explicitOnly = /^disable-model-invocation:\s*true\s*$/imu.test(frontmatter)
      return { name, description, explicitOnly }
    } catch {
      return { name: fallbackName, description: '资源当前未加载。', explicitOnly: false }
    }
  }

  private createSkillTemplate(name: string, description: string): string {
    return `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n---\n\n# ${name}\n\n## 使用场景\n\n说明何时使用这个 Skill。\n\n## 工作流程\n\n1. 确认目标与输入。\n2. 执行任务并验证结果。\n3. 简洁地汇报完成情况。\n`
  }

  private createPluginTemplate(name: string, description: string): string {
    return `import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'\n\nexport default function register(pi: ExtensionAPI) {\n  pi.registerCommand(${JSON.stringify(name)}, {\n    description: ${JSON.stringify(description)},\n    handler: async (_args, ctx) => {\n      ctx.ui.notify(${JSON.stringify(`${name} 已加载`)}, 'info')\n    },\n  })\n}\n`
  }

  private requestAuthPrompt(flowId: string, prompt: RuntimeAuthPrompt): Promise<string> {
    if (this.authFlow?.id !== flowId) return Promise.reject(new Error('登录流程已失效。'))
    this.rejectPendingAuthPrompt(flowId, new Error('登录问题已被替换。'))
    const promptId = randomUUID()

    return new Promise<string>((resolve, reject) => {
      const abort = () => {
        if (this.pendingAuthPrompt?.promptId !== promptId) return
        this.pendingAuthPrompt = undefined
        cleanup()
        reject(new Error('登录已取消。'))
      }
      const cleanup = () => {
        this.authFlow?.controller.signal.removeEventListener('abort', abort)
        prompt.signal?.removeEventListener('abort', abort)
      }
      this.authFlow!.controller.signal.addEventListener('abort', abort, { once: true })
      prompt.signal?.addEventListener('abort', abort, { once: true })
      this.pendingAuthPrompt = { flowId, promptId, resolve, reject, cleanup }
      this.emit({
        type: 'auth:prompt',
        flowId,
        prompt: {
          id: promptId,
          type: prompt.type,
          message: prompt.message,
          ...('placeholder' in prompt ? { placeholder: prompt.placeholder } : {}),
          ...('options' in prompt ? { options: prompt.options.map((option) => ({ ...option })) } : {}),
        },
      })
    })
  }

  private notifyAuthEvent(flowId: string, event: RuntimeAuthEvent): void {
    if (this.authFlow?.id !== flowId) return
    if (event.type === 'info') {
      this.emit({ type: 'auth:event', flowId, event: { type: 'info', message: event.message, links: event.links?.map((link) => ({ ...link })) } })
    } else if (event.type === 'auth_url') {
      this.emit({ type: 'auth:event', flowId, event: { type: 'auth_url', url: event.url, instructions: event.instructions } })
    } else if (event.type === 'device_code') {
      this.emit({
        type: 'auth:event',
        flowId,
        event: {
          type: 'device_code',
          userCode: event.userCode,
          verificationUri: event.verificationUri,
          expiresInSeconds: event.expiresInSeconds,
        },
      })
    } else {
      this.emit({ type: 'auth:event', flowId, event: { type: 'progress', message: event.message } })
    }
  }

  private rejectPendingAuthPrompt(flowId: string, error: Error): void {
    const pending = this.pendingAuthPrompt
    if (!pending || pending.flowId !== flowId) return
    pending.cleanup()
    this.pendingAuthPrompt = undefined
    pending.reject(error)
  }

  private async readModelsDocument(): Promise<ModelsDocument> {
    const modelsPath = path.join(getAgentDir(), 'models.json')
    try {
      const content = await readFile(modelsPath, 'utf8')
      const parsed = JSON.parse(content) as unknown
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('文件根节点必须是 JSON 对象。')
      const document = parsed as ModelsDocument
      if (document.providers !== undefined && (!document.providers || typeof document.providers !== 'object' || Array.isArray(document.providers))) {
        throw new Error('providers 必须是 JSON 对象。')
      }
      return document
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { providers: {} }
      throw new Error(`无法读取 ${modelsPath}：${error instanceof Error ? error.message : String(error)}`, { cause: error })
    }
  }

  private async writeModelsDocument(document: ModelsDocument): Promise<void> {
    const modelsPath = path.join(getAgentDir(), 'models.json')
    await mkdir(path.dirname(modelsPath), { recursive: true })
    await writeFile(modelsPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
  }

  private validateCustomModel(input: CustomModelConfig): CustomModelConfig {
    const providerId = input.providerId.trim().toLowerCase()
    const providerName = input.providerName.trim()
    const modelId = input.modelId.trim()
    const modelName = input.modelName.trim()
    const baseUrl = input.baseUrl.trim().replace(/\/$/, '')
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(providerId)) throw new Error('Provider ID 只能包含小写字母、数字、点、下划线和连字符。')
    if (!providerName || !modelId || !modelName) throw new Error('Provider 名称、模型 ID 和显示名称不能为空。')
    if (!CUSTOM_MODEL_APIS.has(input.api)) throw new Error('不支持所选 API 协议。')
    let url: URL
    try {
      url = new URL(baseUrl)
    } catch (error) {
      throw new Error('Base URL 不是有效地址。', { cause: error })
    }
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Base URL 必须使用 http 或 https。')
    const contextWindow = Math.round(Number(input.contextWindow))
    const maxTokens = Math.round(Number(input.maxTokens))
    if (!Number.isFinite(contextWindow) || contextWindow < 1_024 || contextWindow > 10_000_000) throw new Error('上下文窗口必须介于 1,024 与 10,000,000。')
    if (!Number.isFinite(maxTokens) || maxTokens < 256 || maxTokens > contextWindow) throw new Error('最大输出必须介于 256 与上下文窗口大小之间。')
    return { ...input, providerId, providerName, modelId, modelName, baseUrl, contextWindow, maxTokens }
  }

  private getCompactionState(): CompactionState {
    const session = this.session
    if (!session) return { active: false, count: 0 }
    const entries = session.sessionManager.getEntries().filter((entry) => entry.type === 'compaction')
    const last = entries.at(-1)
    return {
      active: session.isCompacting,
      count: entries.length,
      lastAt: last ? new Date(last.timestamp).getTime() : undefined,
      lastTokensBefore: last?.type === 'compaction' ? last.tokensBefore : undefined,
    }
  }

  private emptyStats(): SessionStats {
    return {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      totalTokens: 0,
      cost: 0,
      contextTokens: null,
      contextWindow: 0,
      contextPercent: null,
    }
  }

  private requireRuntime(): ModelRuntime {
    if (!this.runtime) throw new Error('Pi 运行时尚未初始化。')
    return this.runtime
  }

  private requireSession(): AgentSession {
    if (!this.session) throw new Error('请先选择项目并创建任务。')
    return this.session
  }
}
