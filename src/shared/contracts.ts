export const IPC = {
  bootstrap: 'app:bootstrap',
  chooseProject: 'project:choose',
  openProject: 'project:open',
  refreshWorkspace: 'workspace:refresh',
  openWorkspaceFile: 'workspace:open-file',
  previewWorkspaceFile: 'workspace:preview-file',
  createSession: 'session:create',
  openSession: 'session:open',
  setSessionArchived: 'session:set-archived',
  deleteSession: 'session:delete',
  renameSession: 'session:rename',
  branchSession: 'session:branch',
  forkSession: 'session:fork',
  compactSession: 'session:compact',
  sendPrompt: 'agent:prompt',
  abortAgent: 'agent:abort',
  setModel: 'agent:set-model',
  saveProviderKey: 'settings:save-provider-key',
  refreshModels: 'settings:refresh-models',
  loginProvider: 'settings:login-provider',
  answerAuthPrompt: 'settings:answer-auth-prompt',
  cancelProviderLogin: 'settings:cancel-provider-login',
  disconnectProvider: 'settings:disconnect-provider',
  getCustomModels: 'settings:get-custom-models',
  saveCustomModel: 'settings:save-custom-model',
  deleteCustomModel: 'settings:delete-custom-model',
  getResources: 'resources:get',
  reloadResources: 'resources:reload',
  openResource: 'resources:open',
  setResourceEnabled: 'resources:set-enabled',
  installResourcePackage: 'resources:install-package',
  removeResourcePackage: 'resources:remove-package',
  updateResourcePackage: 'resources:update-package',
  createResourceTemplate: 'resources:create-template',
  windowMinimize: 'window:minimize',
  windowToggleMaximize: 'window:toggle-maximize',
  windowClose: 'window:close',
  completionSound: 'window:completion-sound',
  event: 'desktop:event',
} as const

export type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export type ToolStatus = 'queued' | 'running' | 'success' | 'error'

export interface ProjectInfo {
  name: string
  path: string
  branch?: string
  isGit: boolean
  dirtyCount: number
}

export interface WorktreeInfo {
  path: string
  branch?: string
  head?: string
  current: boolean
  bare: boolean
}

export interface SessionSummary {
  id: string
  path: string
  title: string
  projectPath: string
  createdAt: number
  updatedAt: number
  messageCount: number
  active?: boolean
  streaming?: boolean
  archived?: boolean
}

export interface SessionForkPoint {
  entryId: string
  text: string
  timestamp: number
}

export interface ProviderOption {
  id: string
  name: string
  authenticated: boolean
  authLabel: string
  authMethods: Array<'api_key' | 'oauth'>
  usingOAuth: boolean
}

export interface AuthPromptView {
  id: string
  type: 'text' | 'secret' | 'select' | 'manual_code'
  message: string
  placeholder?: string
  options?: Array<{ id: string; label: string; description?: string }>
}

export type AuthFlowNotice =
  | { type: 'info'; message: string; links?: Array<{ url: string; label?: string }> }
  | { type: 'auth_url'; url: string; instructions?: string }
  | { type: 'device_code'; userCode: string; verificationUri: string; expiresInSeconds?: number }
  | { type: 'progress'; message: string }

export interface ProviderAuthFlow {
  id: string
  providerId: string
  providerName: string
  prompt?: AuthPromptView
  notices: AuthFlowNotice[]
}

export interface ModelOption {
  key: string
  id: string
  name: string
  provider: string
  providerName: string
  authenticated: boolean
  reasoning: boolean
  imageInput?: boolean
  thinkingLevels: ThinkingLevel[]
  contextWindow: number
  maxTokens: number
}

export type CustomModelApi = 'openai-completions' | 'openai-responses' | 'anthropic-messages' | 'google-generative-ai'

export interface CustomModelConfig {
  providerId: string
  providerName: string
  baseUrl: string
  api: CustomModelApi
  modelId: string
  modelName: string
  contextWindow: number
  maxTokens: number
  reasoning: boolean
  imageInput: boolean
  localNoAuth: boolean
  compatibilityMode: boolean
}

export type ResourceScope = 'user' | 'project' | 'temporary'
export type ResourceOrigin = 'package' | 'top-level'
export type ResourceKind = 'skill' | 'plugin'
export type AutoNamingMode = 'smart' | 'prompt' | 'off'

export interface ResourceIdentity {
  path: string
  source: string
  scope: ResourceScope
  origin: ResourceOrigin
  baseDir?: string
  enabled: boolean
  manageable: boolean
}

export interface SkillResource extends ResourceIdentity {
  name: string
  description: string
  explicitOnly: boolean
}

export interface PluginResource extends ResourceIdentity {
  name: string
  hidden: boolean
  tools: string[]
  commands: string[]
  shortcuts: number
}

export interface ResourcePackage {
  source: string
  scope: Exclude<ResourceScope, 'temporary'>
  filtered: boolean
  installedPath?: string
}

export interface ResourceToggleRequest extends ResourceIdentity {
  kind: ResourceKind
}

export interface ResourceTemplateInput {
  kind: ResourceKind
  name: string
  description: string
  scope: Exclude<ResourceScope, 'temporary'>
}

export interface ResourceProgress {
  action: 'install' | 'remove' | 'update' | 'clone' | 'pull'
  source: string
  message: string
}

export interface ResourceIssue {
  type: 'warning' | 'error' | 'collision'
  message: string
  path?: string
}

export interface ResourceCatalog {
  skills: SkillResource[]
  plugins: PluginResource[]
  packages: ResourcePackage[]
  issues: ResourceIssue[]
}

export interface ToolRun {
  id: string
  name: string
  label: string
  status: ToolStatus
  args: Record<string, unknown>
  output: string
  startedAt?: number
  durationMs?: number
}

export interface PromptImage {
  id: string
  name: string
  mimeType: string
  data: string
}

export interface UiMessage {
  id: string
  role: 'user' | 'assistant' | 'notice'
  content: string
  thinking?: string
  timestamp: number
  status?: 'streaming' | 'complete' | 'error'
  error?: string
  provider?: string
  model?: string
  thinkingLevel?: ThinkingLevel
  durationMs?: number
  images?: PromptImage[]
  toolRuns?: ToolRun[]
}

export type ChangeStatus = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'

export interface FileChange {
  path: string
  previousPath?: string
  status: ChangeStatus
  additions: number
  deletions: number
  diff: string
  binary?: boolean
  large?: boolean
  size?: number
  diffTruncated?: boolean
}

export interface FileNode {
  name: string
  path: string
  kind: 'file' | 'directory'
  children?: FileNode[]
}

export type FilePreviewKind = 'text' | 'markdown' | 'diff' | 'image' | 'audio' | 'pdf' | 'docx' | 'unsupported'

export interface FilePreview {
  path: string
  name: string
  kind: FilePreviewKind
  mimeType: string
  size: number
  content?: string
  dataUrl?: string
  html?: string
  truncated?: boolean
}

export interface SessionStats {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  totalTokens: number
  cost: number
  contextTokens: number | null
  contextWindow: number
  contextPercent: number | null
}

export type CompactionReason = 'manual' | 'threshold' | 'overflow'

export interface CompactionState {
  active: boolean
  count: number
  reason?: CompactionReason
  lastAt?: number
  lastTokensBefore?: number
}

export interface AgentSnapshot {
  sessionId?: string
  sessionFile?: string
  sessionName?: string
  project: ProjectInfo
  recentProjects: ProjectInfo[]
  messages: UiMessage[]
  sessions: SessionSummary[]
  forkPoints: SessionForkPoint[]
  changes: FileChange[]
  files: FileNode[]
  worktrees: WorktreeInfo[]
  modelKey?: string
  thinkingLevel: ThinkingLevel
  streaming: boolean
  stats: SessionStats
  compaction: CompactionState
}

export interface AppBootstrap {
  version: string
  platform: NodeJS.Platform | 'browser'
  demoMode: boolean
  recentProjects: ProjectInfo[]
  providers: ProviderOption[]
  models: ModelOption[]
  recoveryNotice?: string
  snapshot?: AgentSnapshot
}

export type DesktopEvent =
  | { type: 'agent:status'; streaming: boolean }
  | { type: 'session:status'; sessionId?: string; sessionFile?: string; projectPath: string; streaming: boolean }
  | { type: 'prompt:failed'; promptId: string; message: string }
  | { type: 'compaction:status'; compaction: CompactionState }
  | { type: 'message:start'; message: UiMessage }
  | { type: 'message:delta'; messageId: string; delta: string; channel: 'text' | 'thinking' }
  | { type: 'message:end'; messageId: string; message: UiMessage }
  | { type: 'tool:start'; messageId: string; tool: ToolRun }
  | { type: 'tool:update'; messageId: string; toolId: string; output: string }
  | { type: 'tool:end'; messageId: string; tool: ToolRun }
  | { type: 'session:snapshot'; snapshot: AgentSnapshot }
  | { type: 'session:name'; sessionId: string; name: string }
  | { type: 'workspace:update'; project: ProjectInfo; changes: FileChange[]; files: FileNode[]; worktrees: WorktreeInfo[] }
  | { type: 'models:update'; providers: ProviderOption[]; models: ModelOption[] }
  | { type: 'auth:start'; flow: ProviderAuthFlow }
  | { type: 'auth:prompt'; flowId: string; prompt: AuthPromptView }
  | { type: 'auth:event'; flowId: string; event: AuthFlowNotice }
  | { type: 'auth:complete'; flowId: string; success: boolean; message: string }
  | { type: 'resources:progress'; progress?: ResourceProgress }
  | { type: 'app:error'; title: string; message: string }

export interface DesktopBridge {
  bootstrap(): Promise<AppBootstrap>
  chooseProject(): Promise<AgentSnapshot | null>
  openProject(path: string): Promise<AgentSnapshot>
  refreshWorkspace(): Promise<{ project: ProjectInfo; changes: FileChange[]; files: FileNode[]; worktrees: WorktreeInfo[] }>
  openWorkspaceFile(path: string): Promise<void>
  previewWorkspaceFile(path: string): Promise<FilePreview>
  createSession(projectPath?: string): Promise<AgentSnapshot>
  openSession(path: string, projectPath?: string): Promise<AgentSnapshot>
  setSessionArchived(path: string, projectPath: string, archived: boolean): Promise<AgentSnapshot>
  deleteSession(path: string, projectPath: string): Promise<AgentSnapshot>
  renameSession(name: string): Promise<void>
  branchSession(entryId: string): Promise<{ snapshot: AgentSnapshot; editorText: string }>
  forkSession(entryId: string): Promise<{ snapshot: AgentSnapshot; editorText: string }>
  compactSession(): Promise<AgentSnapshot>
  sendPrompt(text: string, behavior?: 'steer' | 'followUp', autoNamingMode?: AutoNamingMode, images?: PromptImage[], promptId?: string): Promise<void>
  abortAgent(): Promise<void>
  setModel(modelKey: string, thinkingLevel: ThinkingLevel): Promise<AgentSnapshot>
  saveProviderKey(providerId: string, apiKey: string, remember: boolean): Promise<{ providers: ProviderOption[]; models: ModelOption[] }>
  refreshModels(): Promise<{ providers: ProviderOption[]; models: ModelOption[] }>
  loginProvider(providerId: string): Promise<{ providers: ProviderOption[]; models: ModelOption[] }>
  answerAuthPrompt(flowId: string, promptId: string, value?: string): Promise<void>
  cancelProviderLogin(flowId: string): Promise<void>
  disconnectProvider(providerId: string): Promise<{ providers: ProviderOption[]; models: ModelOption[] }>
  getCustomModels(): Promise<CustomModelConfig[]>
  saveCustomModel(model: CustomModelConfig): Promise<{ customModels: CustomModelConfig[]; providers: ProviderOption[]; models: ModelOption[] }>
  deleteCustomModel(providerId: string, modelId: string): Promise<{ customModels: CustomModelConfig[]; providers: ProviderOption[]; models: ModelOption[] }>
  getResources(): Promise<ResourceCatalog>
  reloadResources(): Promise<ResourceCatalog>
  openResource(path: string): Promise<void>
  setResourceEnabled(request: ResourceToggleRequest): Promise<ResourceCatalog>
  installResourcePackage(source: string, scope: Exclude<ResourceScope, 'temporary'>): Promise<ResourceCatalog>
  removeResourcePackage(source: string, scope: Exclude<ResourceScope, 'temporary'>): Promise<ResourceCatalog>
  updateResourcePackage(source?: string): Promise<ResourceCatalog>
  createResourceTemplate(input: ResourceTemplateInput): Promise<ResourceCatalog>
  minimizeWindow(): void
  toggleMaximizeWindow(): void
  closeWindow(): void
  playCompletionSound(): void
  onEvent(listener: (event: DesktopEvent) => void): () => void
}

declare global {
  interface Window {
    piDesktop?: DesktopBridge
  }
}
