import { create } from 'zustand'
import { desktop } from '../lib/desktop'
import type {
  AgentSnapshot,
  AutoNamingMode,
  CustomModelConfig,
  CompactionState,
  DesktopEvent,
  FileChange,
  FileNode,
  FilePreview,
  ModelOption,
  PromptImage,
  ProjectInfo,
  ProviderOption,
  ProviderAuthFlow,
  ResourceCatalog,
  ResourceProgress,
  ResourceTemplateInput,
  ResourceToggleRequest,
  SessionForkPoint,
  SessionStats,
  SessionSummary,
  ThinkingLevel,
  UiMessage,
  WorktreeInfo,
} from '../shared/contracts'
import { friendlyPromptError } from '../shared/prompt-error'

interface ToastMessage {
  id: string
  title: string
  message: string
}

interface AppState {
  ready: boolean
  busy: boolean
  demoMode: boolean
  version: string
  project?: ProjectInfo
  recentProjects: ProjectInfo[]
  sessions: SessionSummary[]
  forkPoints: SessionForkPoint[]
  messages: UiMessage[]
  changes: FileChange[]
  files: FileNode[]
  worktrees: WorktreeInfo[]
  filePreview?: FilePreview
  previewBusy: boolean
  providers: ProviderOption[]
  models: ModelOption[]
  customModels: CustomModelConfig[]
  authFlow?: ProviderAuthFlow
  resources: ResourceCatalog
  resourcesBusy: boolean
  resourceProgress?: ResourceProgress
  modelKey?: string
  thinkingLevel: ThinkingLevel
  streaming: boolean
  stats: SessionStats
  compaction: CompactionState
  sessionName?: string
  sessionId?: string
  toasts: ToastMessage[]
  initialize: () => Promise<() => void>
  chooseProject: () => Promise<void>
  openProject: (path: string) => Promise<void>
  createSession: (projectPath?: string) => Promise<void>
  openSession: (path: string, projectPath?: string) => Promise<void>
  setSessionArchived: (path: string, projectPath: string, archived: boolean) => Promise<void>
  deleteSession: (path: string, projectPath: string) => Promise<void>
  renameSession: (name: string) => Promise<void>
  branchSession: (entryId: string) => Promise<boolean>
  forkSession: (entryId: string) => Promise<boolean>
  compactSession: () => Promise<void>
  sendPrompt: (text: string, behavior?: 'steer' | 'followUp', autoNamingMode?: AutoNamingMode, images?: PromptImage[]) => Promise<boolean>
  retryPrompt: (messageId: string) => Promise<boolean>
  abortAgent: () => Promise<void>
  setModel: (key: string, level: ThinkingLevel) => Promise<void>
  saveProviderKey: (provider: string, key: string, remember: boolean) => Promise<boolean>
  refreshModels: () => Promise<void>
  loginProvider: (providerId: string) => Promise<void>
  answerAuthPrompt: (promptId: string, value?: string) => Promise<void>
  cancelProviderLogin: () => Promise<void>
  disconnectProvider: (providerId: string) => Promise<boolean>
  getCustomModels: () => Promise<void>
  saveCustomModel: (model: CustomModelConfig) => Promise<boolean>
  deleteCustomModel: (providerId: string, modelId: string) => Promise<boolean>
  getResources: () => Promise<void>
  reloadResources: () => Promise<void>
  openResource: (path: string) => Promise<void>
  setResourceEnabled: (request: ResourceToggleRequest) => Promise<boolean>
  installResourcePackage: (source: string, scope: 'user' | 'project') => Promise<boolean>
  removeResourcePackage: (source: string, scope: 'user' | 'project') => Promise<boolean>
  updateResourcePackage: (source?: string) => Promise<boolean>
  createResourceTemplate: (input: ResourceTemplateInput) => Promise<boolean>
  refreshWorkspace: () => Promise<void>
  previewFile: (path: string) => Promise<void>
  previewChange: (path: string) => void
  closeFilePreview: () => void
  dismissToast: (id: string) => void
}

const EMPTY_STATS: SessionStats = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  totalTokens: 0,
  cost: 0,
  contextTokens: null,
  contextWindow: 0,
  contextPercent: null,
}

function snapshotState(snapshot: AgentSnapshot): Partial<AppState> {
  return {
    project: snapshot.project,
    recentProjects: snapshot.recentProjects,
    sessions: snapshot.sessions,
    forkPoints: snapshot.forkPoints,
    messages: snapshot.messages,
    changes: snapshot.changes,
    files: snapshot.files,
    worktrees: snapshot.worktrees,
    modelKey: snapshot.modelKey,
    thinkingLevel: snapshot.thinkingLevel,
    streaming: snapshot.streaming,
    stats: snapshot.stats,
    compaction: snapshot.compaction,
    sessionName: snapshot.sessionName,
    sessionId: snapshot.sessionId,
  }
}

function createErrorToast(error: unknown, title = '操作未完成'): ToastMessage {
  return {
    id: crypto.randomUUID(),
    title,
    message: error instanceof Error ? error.message : String(error),
  }
}

function updateMessage(messages: UiMessage[], id: string, updater: (message: UiMessage) => UiMessage): UiMessage[] {
  return messages.map((message) => (message.id === id ? updater(message) : message))
}

export function reduceDesktopEvent(state: AppState, event: DesktopEvent): Partial<AppState> {
  switch (event.type) {
    case 'agent:status':
      return {
        streaming: event.streaming,
        sessions: state.sessions.map((session) => session.active
          ? {
              ...session,
              streaming: event.streaming,
              updatedAt: event.streaming ? Date.now() : session.updatedAt,
            }
          : session),
      }
    case 'session:status':
      return {
        streaming: state.sessionId === event.sessionId ? event.streaming : state.streaming,
        sessions: state.sessions.map((session) =>
          session.id === event.sessionId || session.path === event.sessionFile
            ? { ...session, streaming: event.streaming, updatedAt: event.streaming ? Date.now() : session.updatedAt }
            : session,
        ),
      }
    case 'prompt:failed':
      return {
        messages: updateMessage(state.messages, event.promptId, (message) => ({ ...message, status: 'error', error: event.message })),
        toasts: [...state.toasts, { id: crypto.randomUUID(), title: '消息发送失败', message: event.message }],
      }
    case 'compaction:status':
      return { compaction: event.compaction }
    case 'message:start':
      return {
        messages: [...state.messages.filter((message) => message.id !== event.message.id), event.message],
      }
    case 'message:delta':
      return {
        messages: updateMessage(state.messages, event.messageId, (message) =>
          event.channel === 'thinking'
            ? { ...message, thinking: `${message.thinking ?? ''}${event.delta}` }
            : { ...message, content: `${message.content}${event.delta}` },
        ),
      }
    case 'message:end':
      return {
        messages: updateMessage(state.messages, event.messageId, (previous) => ({
          ...event.message,
          toolRuns: event.message.toolRuns?.length ? event.message.toolRuns : previous.toolRuns,
        })),
      }
    case 'tool:start':
      return {
        messages: updateMessage(state.messages, event.messageId, (message) => ({
          ...message,
          toolRuns: [...(message.toolRuns ?? []), event.tool],
        })),
      }
    case 'tool:update':
      return {
        messages: updateMessage(state.messages, event.messageId, (message) => ({
          ...message,
          toolRuns: message.toolRuns?.map((tool) =>
            tool.id === event.toolId ? { ...tool, output: event.output || tool.output } : tool,
          ),
        })),
      }
    case 'tool:end':
      return {
        messages: updateMessage(state.messages, event.messageId, (message) => ({
          ...message,
          toolRuns: message.toolRuns?.map((tool) =>
            tool.id === event.tool.id ? { ...tool, ...event.tool, args: Object.keys(event.tool.args).length ? event.tool.args : tool.args } : tool,
          ),
        })),
      }
    case 'session:snapshot':
      return snapshotState(event.snapshot)
    case 'session:name':
      return state.sessionId === event.sessionId
        ? {
            sessionName: event.name,
            sessions: state.sessions.map((session) => session.id === event.sessionId ? { ...session, title: event.name } : session),
          }
        : {}
    case 'workspace:update':
      return { project: event.project, changes: event.changes, files: event.files, worktrees: event.worktrees }
    case 'models:update':
      return { providers: event.providers, models: event.models }
    case 'auth:start':
      return { authFlow: event.flow }
    case 'auth:prompt':
      return state.authFlow?.id === event.flowId ? { authFlow: { ...state.authFlow, prompt: event.prompt } } : {}
    case 'auth:event':
      return state.authFlow?.id === event.flowId
        ? { authFlow: { ...state.authFlow, notices: [...state.authFlow.notices, event.event] } }
        : {}
    case 'auth:complete':
      return {
        authFlow: undefined,
        toasts: event.success
          ? [...state.toasts, { id: crypto.randomUUID(), title: 'Provider 已连接', message: event.message }]
          : state.toasts,
      }
    case 'resources:progress':
      return { resourceProgress: event.progress }
    case 'app:error':
      return { toasts: [...state.toasts, { id: crypto.randomUUID(), title: event.title, message: event.message }] }
  }
}

/**
 * Streaming arrives token by token. Coalescing deltas into one commit per animation frame keeps
 * React from re-rendering the whole transcript hundreds of times a second, and keeps only the newest
 * tool output per tool (Pi resends the whole buffer on every tool update).
 */
let queuedDeltas: DesktopEvent[] = []
let queuedFrame = 0

export function reduceDeltaBatch(state: AppState, events: DesktopEvent[]): Partial<AppState> {
  const textDeltas = new Map<string, string>()
  const thinkingDeltas = new Map<string, string>()
  const toolOutputs = new Map<string, string>()

  for (const event of events) {
    if (event.type === 'message:delta') {
      const bucket = event.channel === 'thinking' ? thinkingDeltas : textDeltas
      bucket.set(event.messageId, `${bucket.get(event.messageId) ?? ''}${event.delta}`)
    } else if (event.type === 'tool:update') {
      toolOutputs.set(event.toolId, event.output)
    }
  }

  if (!textDeltas.size && !thinkingDeltas.size && !toolOutputs.size) return {}

  return {
    messages: state.messages.map((message) => {
      const text = textDeltas.get(message.id)
      const thinking = thinkingDeltas.get(message.id)
      const touchedTool = message.toolRuns?.some((tool) => toolOutputs.has(tool.id))
      if (!text && !thinking && !touchedTool) return message
      return {
        ...message,
        content: text ? `${message.content}${text}` : message.content,
        thinking: thinking ? `${message.thinking ?? ''}${thinking}` : message.thinking,
        toolRuns: touchedTool
          ? message.toolRuns?.map((tool) => {
              const output = toolOutputs.get(tool.id)
              return output ? { ...tool, output } : tool
            })
          : message.toolRuns,
      }
    }),
  }
}

function flushQueuedDeltas(): void {
  queuedFrame = 0
  const queued = queuedDeltas
  queuedDeltas = []
  if (queued.length) useAppStore.setState((state) => reduceDeltaBatch(state, queued))
}

function applyDesktopEvent(event: DesktopEvent): void {
  if (event.type === 'message:delta' || event.type === 'tool:update') {
    queuedDeltas.push(event)
    if (!queuedFrame) queuedFrame = window.requestAnimationFrame(flushQueuedDeltas)
    return
  }
  flushQueuedDeltas()
  useAppStore.setState((state) => reduceDesktopEvent(state, event))
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  busy: false,
  demoMode: false,
  version: '',
  recentProjects: [],
  sessions: [],
  forkPoints: [],
  messages: [],
  changes: [],
  files: [],
  worktrees: [],
  previewBusy: false,
  providers: [],
  models: [],
  customModels: [],
  resources: { skills: [], plugins: [], packages: [], issues: [] },
  resourcesBusy: false,
  thinkingLevel: 'medium',
  streaming: false,
  stats: EMPTY_STATS,
  compaction: { active: false, count: 0 },
  toasts: [],

  initialize: async () => {
    const unsubscribe = desktop.onEvent((event) => applyDesktopEvent(event))
    try {
      const bootstrap = await desktop.bootstrap()
      set((state) => ({
        ready: true,
        demoMode: bootstrap.demoMode,
        version: bootstrap.version,
        recentProjects: bootstrap.recentProjects,
        providers: bootstrap.providers,
        models: bootstrap.models,
        ...(bootstrap.snapshot ? snapshotState(bootstrap.snapshot) : {}),
        toasts: bootstrap.recoveryNotice
          ? [...state.toasts, { id: crypto.randomUUID(), title: '已恢复上次工作区', message: bootstrap.recoveryNotice }]
          : state.toasts,
      }))
    } catch (error) {
      set((state) => ({ ready: true, toasts: [...state.toasts, createErrorToast(error, 'PiLens 启动失败')] }))
    }
    return unsubscribe
  },

  chooseProject: async () => {
    set({ busy: true })
    try {
      const snapshot = await desktop.chooseProject()
      if (snapshot) set({ ...snapshotState(snapshot), busy: false })
      else set({ busy: false })
    } catch (error) {
      set((state) => ({ busy: false, toasts: [...state.toasts, createErrorToast(error)] }))
    }
  },

  openProject: async (path) => {
    set({ busy: true })
    try {
      const snapshot = await desktop.openProject(path)
      set({ ...snapshotState(snapshot), busy: false })
    } catch (error) {
      set((state) => ({ busy: false, toasts: [...state.toasts, createErrorToast(error)] }))
    }
  },

  createSession: async (projectPath) => {
    if (!projectPath && !get().project) return get().chooseProject()
    try {
      const snapshot = await desktop.createSession(projectPath)
      set(snapshotState(snapshot))
    } catch (error) {
      set((state) => ({ toasts: [...state.toasts, createErrorToast(error)] }))
    }
  },

  openSession: async (path, projectPath) => {
    try {
      const snapshot = await desktop.openSession(path, projectPath)
      set(snapshotState(snapshot))
    } catch (error) {
      set((state) => ({ toasts: [...state.toasts, createErrorToast(error)] }))
    }
  },

  setSessionArchived: async (path, projectPath, archived) => {
    try {
      const snapshot = await desktop.setSessionArchived(path, projectPath, archived)
      set((state) => ({
        ...snapshotState(snapshot),
        toasts: [...state.toasts, {
          id: crypto.randomUUID(),
          title: archived ? '会话已归档' : '会话已恢复',
          message: archived ? '可从侧栏的“已归档”中恢复。' : '会话已回到项目列表。',
        }],
      }))
    } catch (error) {
      set((state) => ({ toasts: [...state.toasts, createErrorToast(error, archived ? '归档失败' : '恢复失败')] }))
    }
  },

  deleteSession: async (path, projectPath) => {
    try {
      const snapshot = await desktop.deleteSession(path, projectPath)
      set((state) => ({
        ...snapshotState(snapshot),
        toasts: [...state.toasts, { id: crypto.randomUUID(), title: '会话已移到回收站', message: '需要时可从 Windows 回收站恢复。' }],
      }))
    } catch (error) {
      set((state) => ({ toasts: [...state.toasts, createErrorToast(error, '删除失败')] }))
    }
  },

  renameSession: async (name) => {
    const normalized = name.trim() || '新任务'
    try {
      await desktop.renameSession(normalized)
      set((state) => ({
        sessionName: normalized,
        sessions: state.sessions.map((session) => session.active
          ? { ...session, title: normalized, updatedAt: Date.now() }
          : session),
      }))
    } catch (error) {
      set((state) => ({ toasts: [...state.toasts, createErrorToast(error, '会话重命名失败')] }))
    }
  },

  branchSession: async (entryId) => {
    set({ busy: true })
    try {
      const result = await desktop.branchSession(entryId)
      set((state) => ({
        ...snapshotState(result.snapshot),
        busy: false,
        toasts: [...state.toasts, { id: crypto.randomUUID(), title: '已创建会话分支', message: '历史提示已恢复到输入框，可修改后继续。' }],
      }))
      window.dispatchEvent(new CustomEvent('pi:reuse-prompt', { detail: result.editorText }))
      return true
    } catch (error) {
      set((state) => ({ busy: false, toasts: [...state.toasts, createErrorToast(error, '创建分支失败')] }))
      return false
    }
  },

  forkSession: async (entryId) => {
    set({ busy: true })
    try {
      const result = await desktop.forkSession(entryId)
      set((state) => ({
        ...snapshotState(result.snapshot),
        busy: false,
        toasts: [...state.toasts, { id: crypto.randomUUID(), title: '已 Fork 为独立会话', message: '新会话已打开，原提示已恢复到输入框。' }],
      }))
      window.dispatchEvent(new CustomEvent('pi:reuse-prompt', { detail: result.editorText }))
      return true
    } catch (error) {
      set((state) => ({ busy: false, toasts: [...state.toasts, createErrorToast(error, 'Fork 会话失败')] }))
      return false
    }
  },

  compactSession: async () => {
    set({ busy: true })
    try {
      const snapshot = await desktop.compactSession()
      set({ ...snapshotState(snapshot), busy: false })
    } catch (error) {
      set((state) => ({ busy: false, toasts: [...state.toasts, createErrorToast(error, '上下文压缩失败')] }))
    }
  },

  sendPrompt: async (text, behavior, autoNamingMode, images = []) => {
    const normalized = text.trim() || (images.length ? '请查看附带的图片。' : '')
    if (!normalized) return false
    const optimistic: UiMessage = {
      id: `local-${crypto.randomUUID()}`,
      role: 'user',
      content: normalized,
      timestamp: Date.now(),
      status: 'complete',
      images,
    }
    set((state) => ({ messages: [...state.messages, optimistic] }))
    try {
      await desktop.sendPrompt(normalized, behavior, autoNamingMode, images, optimistic.id)
      return true
    } catch (error) {
      const friendly = friendlyPromptError(error)
      set((state) => ({
        messages: state.messages.filter((message) => message.id !== optimistic.id),
        toasts: [...state.toasts, { id: crypto.randomUUID(), title: '消息发送失败', message: friendly }],
      }))
      return false
    }
  },

  retryPrompt: async (messageId) => {
    const message = get().messages.find((candidate) => candidate.id === messageId && candidate.role === 'user')
    if (!message) return false
    set((state) => ({ messages: updateMessage(state.messages, messageId, (candidate) => ({ ...candidate, status: 'complete', error: undefined })) }))
    try {
      await desktop.sendPrompt(message.content, undefined, 'off', message.images, message.id)
      return true
    } catch (error) {
      const friendly = friendlyPromptError(error)
      set((state) => ({
        messages: updateMessage(state.messages, messageId, (candidate) => ({ ...candidate, status: 'error', error: friendly })),
        toasts: [...state.toasts, { id: crypto.randomUUID(), title: '重试失败', message: friendly }],
      }))
      return false
    }
  },

  abortAgent: async () => {
    try {
      await desktop.abortAgent()
    } catch (error) {
      set((state) => ({ toasts: [...state.toasts, createErrorToast(error)] }))
    }
  },

  setModel: async (key, level) => {
    set({ modelKey: key, thinkingLevel: level })
    try {
      const snapshot = await desktop.setModel(key, level)
      set(snapshotState(snapshot))
    } catch (error) {
      set((state) => ({ toasts: [...state.toasts, createErrorToast(error, '模型切换失败')] }))
    }
  },

  saveProviderKey: async (provider, key, remember) => {
    try {
      const catalog = await desktop.saveProviderKey(provider, key, remember)
      set(catalog)
      return true
    } catch (error) {
      set((state) => ({ toasts: [...state.toasts, createErrorToast(error, 'Provider 连接失败')] }))
      return false
    }
  },

  refreshModels: async () => {
    set({ busy: true })
    try {
      const catalog = await desktop.refreshModels()
      set({ ...catalog, busy: false })
    } catch (error) {
      set((state) => ({ busy: false, toasts: [...state.toasts, createErrorToast(error, '模型目录刷新失败')] }))
    }
  },

  loginProvider: async (providerId) => {
    try {
      const catalog = await desktop.loginProvider(providerId)
      set(catalog)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!message.includes('已取消')) {
        set((state) => ({ authFlow: undefined, toasts: [...state.toasts, createErrorToast(error, 'OAuth 登录失败')] }))
      }
    }
  },

  answerAuthPrompt: async (promptId, value) => {
    const flow = get().authFlow
    if (!flow) return
    try {
      await desktop.answerAuthPrompt(flow.id, promptId, value)
      set((state) => state.authFlow?.id === flow.id ? { authFlow: { ...state.authFlow, prompt: undefined } } : {})
    } catch (error) {
      set((state) => ({ toasts: [...state.toasts, createErrorToast(error, '无法提交登录信息')] }))
    }
  },

  cancelProviderLogin: async () => {
    const flow = get().authFlow
    if (!flow) return
    set({ authFlow: undefined })
    try {
      await desktop.cancelProviderLogin(flow.id)
    } catch {
      // The flow may already have completed while the dialog was closing.
    }
  },

  disconnectProvider: async (providerId) => {
    try {
      const catalog = await desktop.disconnectProvider(providerId)
      set((state) => ({
        ...catalog,
        toasts: [...state.toasts, { id: crypto.randomUUID(), title: '本地凭据已移除', message: '如果环境变量仍提供凭据，Provider 可能仍显示为已连接。' }],
      }))
      return true
    } catch (error) {
      set((state) => ({ toasts: [...state.toasts, createErrorToast(error, '无法断开 Provider')] }))
      return false
    }
  },

  getCustomModels: async () => {
    try {
      set({ customModels: await desktop.getCustomModels() })
    } catch (error) {
      set((state) => ({ toasts: [...state.toasts, createErrorToast(error, '无法读取自定义模型')] }))
    }
  },

  saveCustomModel: async (model) => {
    set({ busy: true })
    try {
      const result = await desktop.saveCustomModel(model)
      set((state) => ({
        customModels: result.customModels,
        providers: result.providers,
        models: result.models,
        busy: false,
        toasts: [...state.toasts, { id: crypto.randomUUID(), title: '自定义模型已保存', message: `${model.providerName} / ${model.modelName} 已加入模型目录。` }],
      }))
      return true
    } catch (error) {
      set((state) => ({ busy: false, toasts: [...state.toasts, createErrorToast(error, '自定义模型保存失败')] }))
      return false
    }
  },

  deleteCustomModel: async (providerId, modelId) => {
    set({ busy: true })
    try {
      const result = await desktop.deleteCustomModel(providerId, modelId)
      set((state) => ({
        customModels: result.customModels,
        providers: result.providers,
        models: result.models,
        busy: false,
        toasts: [...state.toasts, { id: crypto.randomUUID(), title: '自定义模型已移除', message: `${providerId}/${modelId} 已从 Pi 模型目录移除。` }],
      }))
      return true
    } catch (error) {
      set((state) => ({ busy: false, toasts: [...state.toasts, createErrorToast(error, '无法移除自定义模型')] }))
      return false
    }
  },

  getResources: async () => {
    set({ resourcesBusy: true })
    try {
      const resources = await desktop.getResources()
      set({ resources, resourcesBusy: false })
    } catch (error) {
      set((state) => ({ resourcesBusy: false, toasts: [...state.toasts, createErrorToast(error, '资源读取失败')] }))
    }
  },

  reloadResources: async () => {
    set({ resourcesBusy: true })
    try {
      const resources = await desktop.reloadResources()
      set((state) => ({
        resources,
        resourcesBusy: false,
        toasts: [...state.toasts, { id: crypto.randomUUID(), title: '资源已重载', message: `已发现 ${resources.skills.length} 个 Skills 和 ${resources.plugins.length} 个 Plugins。` }],
      }))
    } catch (error) {
      set((state) => ({ resourcesBusy: false, toasts: [...state.toasts, createErrorToast(error, '资源重载失败')] }))
    }
  },

  openResource: async (path) => {
    try {
      await desktop.openResource(path)
    } catch (error) {
      set((state) => ({ toasts: [...state.toasts, createErrorToast(error, '无法打开资源')] }))
    }
  },

  setResourceEnabled: async (request) => {
    set({ resourcesBusy: true })
    try {
      const resources = await desktop.setResourceEnabled(request)
      set((state) => ({
        resources,
        resourcesBusy: false,
        toasts: [...state.toasts, {
          id: crypto.randomUUID(),
          title: request.enabled ? '资源已启用' : '资源已停用',
          message: `${request.path.replaceAll('\\', '/').split('/').at(-1)} 将从下一条消息开始${request.enabled ? '可用' : '不再加载'}。`,
        }],
      }))
      return true
    } catch (error) {
      set((state) => ({ resourcesBusy: false, toasts: [...state.toasts, createErrorToast(error, '资源状态更新失败')] }))
      return false
    }
  },

  installResourcePackage: async (source, scope) => {
    set({ resourcesBusy: true })
    try {
      const resources = await desktop.installResourcePackage(source, scope)
      set((state) => ({
        resources,
        resourcesBusy: false,
        toasts: [...state.toasts, { id: crypto.randomUUID(), title: '资源包已安装', message: `${source} 已安装并加载。` }],
      }))
      return true
    } catch (error) {
      set((state) => ({ resourcesBusy: false, resourceProgress: undefined, toasts: [...state.toasts, createErrorToast(error, '资源包安装失败')] }))
      return false
    }
  },

  removeResourcePackage: async (source, scope) => {
    set({ resourcesBusy: true })
    try {
      const resources = await desktop.removeResourcePackage(source, scope)
      set((state) => ({
        resources,
        resourcesBusy: false,
        toasts: [...state.toasts, { id: crypto.randomUUID(), title: '资源包已卸载', message: `${source} 已从 Pi 配置中移除。` }],
      }))
      return true
    } catch (error) {
      set((state) => ({ resourcesBusy: false, resourceProgress: undefined, toasts: [...state.toasts, createErrorToast(error, '资源包卸载失败')] }))
      return false
    }
  },

  updateResourcePackage: async (source) => {
    set({ resourcesBusy: true })
    try {
      const resources = await desktop.updateResourcePackage(source)
      set((state) => ({
        resources,
        resourcesBusy: false,
        toasts: [...state.toasts, { id: crypto.randomUUID(), title: '资源包已更新', message: source ? `${source} 已更新并重新加载。` : '所有资源包已检查并重新加载。' }],
      }))
      return true
    } catch (error) {
      set((state) => ({ resourcesBusy: false, resourceProgress: undefined, toasts: [...state.toasts, createErrorToast(error, '资源包更新失败')] }))
      return false
    }
  },

  createResourceTemplate: async (input) => {
    set({ resourcesBusy: true })
    try {
      const resources = await desktop.createResourceTemplate(input)
      set((state) => ({
        resources,
        resourcesBusy: false,
        toasts: [...state.toasts, { id: crypto.randomUUID(), title: input.kind === 'skill' ? 'Skill 已创建' : 'Plugin 已创建', message: `${input.name} 已创建并加载，可通过“打开来源”继续编辑。` }],
      }))
      return true
    } catch (error) {
      set((state) => ({ resourcesBusy: false, toasts: [...state.toasts, createErrorToast(error, '资源创建失败')] }))
      return false
    }
  },

  refreshWorkspace: async () => {
    if (!get().project) return
    try {
      const next = await desktop.refreshWorkspace()
      set(next)
    } catch (error) {
      set((state) => ({ toasts: [...state.toasts, createErrorToast(error)] }))
    }
  },

  previewFile: async (path) => {
    set({
      previewBusy: true,
      filePreview: {
        path,
        name: path.replaceAll('\\', '/').split('/').at(-1) ?? path,
        kind: 'text',
        mimeType: 'text/plain',
        size: 0,
        content: '',
      },
    })
    try {
      const filePreview = await desktop.previewWorkspaceFile(path)
      set({ filePreview, previewBusy: false })
    } catch (error) {
      set((state) => ({ filePreview: undefined, previewBusy: false, toasts: [...state.toasts, createErrorToast(error, '无法预览文件')] }))
    }
  },

  previewChange: (path) => {
    const change = get().changes.find((item) => item.path === path)
    if (!change) return
    set({
      filePreview: {
        path: change.path,
        name: change.path.split('/').at(-1) ?? change.path,
        kind: 'diff',
        mimeType: 'text/x-diff',
        size: change.diff.length,
        content: change.diff || '这个文件没有可显示的文本 Diff。',
      },
      previewBusy: false,
    })
  },

  closeFilePreview: () => set({ filePreview: undefined, previewBusy: false }),

  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}))
