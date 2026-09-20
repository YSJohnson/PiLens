import type {
  AgentSnapshot,
  AppBootstrap,
  DesktopBridge,
  DesktopEvent,
  FileNode,
  ModelOption,
  ProviderOption,
  ResourceCatalog,
  ThinkingLevel,
  UiMessage,
} from '../shared/contracts'
import { provisionalSessionTitle } from '../shared/session-title'

const listeners = new Set<(event: DesktopEvent) => void>()
let demoAuthGeneration = 0

const providers: ProviderOption[] = [
  { id: 'anthropic', name: 'Anthropic', authenticated: true, authLabel: '环境变量', authMethods: ['api_key', 'oauth'], usingOAuth: false },
  { id: 'openai', name: 'OpenAI', authenticated: false, authLabel: '需要 API Key 或登录', authMethods: ['api_key', 'oauth'], usingOAuth: false },
  { id: 'google', name: 'Google', authenticated: false, authLabel: '需要 API Key 或登录', authMethods: ['api_key', 'oauth'], usingOAuth: false },
  { id: 'openrouter', name: 'OpenRouter', authenticated: false, authLabel: '需要 API Key', authMethods: ['api_key'], usingOAuth: false },
]

const models: ModelOption[] = [
  {
    key: 'anthropic/claude-sonnet-4-5',
    id: 'claude-sonnet-4-5',
    name: 'Claude Sonnet 4.5',
    provider: 'anthropic',
    providerName: 'Anthropic',
    authenticated: true,
    reasoning: true,
    thinkingLevels: ['off', 'minimal', 'low', 'medium', 'high'],
    contextWindow: 200_000,
    maxTokens: 64_000,
  },
  {
    key: 'anthropic/claude-opus-4-1',
    id: 'claude-opus-4-1',
    name: 'Claude Opus 4.1',
    provider: 'anthropic',
    providerName: 'Anthropic',
    authenticated: true,
    reasoning: true,
    thinkingLevels: ['off', 'low', 'medium', 'high'],
    contextWindow: 200_000,
    maxTokens: 64_000,
  },
  {
    key: 'anthropic/claude-haiku-3-5',
    id: 'claude-haiku-3-5',
    name: 'Claude Haiku 3.5',
    provider: 'anthropic',
    providerName: 'Anthropic',
    authenticated: true,
    reasoning: false,
    thinkingLevels: ['off'],
    contextWindow: 200_000,
    maxTokens: 8_192,
  },
  {
    key: 'openai/gpt-5.4',
    id: 'gpt-5.4',
    name: 'GPT-5.4',
    provider: 'openai',
    providerName: 'OpenAI',
    authenticated: false,
    reasoning: true,
    thinkingLevels: ['off', 'low', 'medium', 'high', 'xhigh'],
    contextWindow: 400_000,
    maxTokens: 128_000,
  },
  {
    key: 'openai/gpt-5.6-sol',
    id: 'gpt-5.6-sol',
    name: 'GPT-5.6 Sol',
    provider: 'openai',
    providerName: 'OpenAI',
    authenticated: false,
    reasoning: true,
    thinkingLevels: ['low', 'medium', 'high', 'xhigh'],
    contextWindow: 400_000,
    maxTokens: 128_000,
  },
  {
    key: 'google/gemini-2.5-pro',
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'google',
    providerName: 'Google',
    authenticated: false,
    reasoning: true,
    thinkingLevels: ['off', 'low', 'medium', 'high'],
    contextWindow: 1_000_000,
    maxTokens: 64_000,
  },
  {
    key: 'google/gemini-2.5-flash',
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'google',
    providerName: 'Google',
    authenticated: false,
    reasoning: true,
    thinkingLevels: ['off', 'low', 'medium'],
    contextWindow: 1_000_000,
    maxTokens: 64_000,
  },
  {
    key: 'openrouter/deepseek-r1',
    id: 'deepseek-r1',
    name: 'DeepSeek R1',
    provider: 'openrouter',
    providerName: 'OpenRouter',
    authenticated: false,
    reasoning: true,
    thinkingLevels: ['medium', 'high'],
    contextWindow: 128_000,
    maxTokens: 32_000,
  },
  {
    key: 'openrouter/llama-3.3-70b',
    id: 'llama-3.3-70b',
    name: 'Llama 3.3 70B',
    provider: 'openrouter',
    providerName: 'OpenRouter',
    authenticated: false,
    reasoning: false,
    thinkingLevels: ['off'],
    contextWindow: 128_000,
    maxTokens: 16_000,
  },
]

const fileTree: FileNode[] = [
  {
    name: 'src',
    path: 'src',
    kind: 'directory',
    children: [
      {
        name: 'services',
        path: 'src/services',
        kind: 'directory',
        children: [{ name: 'SyncService.ts', path: 'src/services/sync/SyncService.ts', kind: 'file' }],
      },
      { name: 'app.ts', path: 'src/app.ts', kind: 'file' },
    ],
  },
  {
    name: 'tests',
    path: 'tests',
    kind: 'directory',
    children: [{ name: 'sync.performance.spec.ts', path: 'tests/e2e/sync/sync.performance.spec.ts', kind: 'file' }],
  },
  { name: 'package.json', path: 'package.json', kind: 'file' },
  { name: 'README.md', path: 'README.md', kind: 'file' },
]

const messages: UiMessage[] = [
  {
    id: 'demo-user-setup',
    role: 'user',
    content: '先定位同步链路里最慢的阶段，别急着改代码。',
    timestamp: Date.now() - 540_000,
    status: 'complete',
  },
  {
    id: 'demo-assistant-setup',
    role: 'assistant',
    content: '性能采样显示，主要耗时来自逐条数据库写入和连接池等待。',
    timestamp: Date.now() - 500_000,
    status: 'complete',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
  },
  {
    id: 'demo-user-plan',
    role: 'user',
    content: '把数据库写入改成批量处理，同时限制并发，先说明会影响哪些文件。',
    timestamp: Date.now() - 420_000,
    status: 'complete',
  },
  {
    id: 'demo-assistant-plan',
    role: 'assistant',
    content: '改动会集中在同步服务、数据库迁移和性能测试三个位置。',
    timestamp: Date.now() - 380_000,
    status: 'complete',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
  },
  {
    id: 'demo-user',
    role: 'user',
    content: '分析并优化用户数据同步的性能瓶颈，要求减少延迟、降低资源占用，并给出改动说明。',
    timestamp: Date.now() - 180_000,
    status: 'complete',
  },
  {
    id: 'demo-assistant',
    role: 'assistant',
    content:
      '已完成数据同步流程的性能分析，瓶颈集中在逐条写入、缺少复合索引和无界并发三处。现在写入改为 500 条一批的 upsert，并把并发限制为 CPU 核心数的 2 倍。\n\n- 批量写入：减少数据库往返，降低主路径延迟。\n- 索引优化：补充用户与更新时间复合索引。\n- 并发控制：避免高负载时争抢连接池。',
    thinking: '先检查同步服务的写入路径与现有测试，再用基准结果确认修改是否有效。',
    timestamp: Date.now() - 150_000,
    status: 'complete',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    thinkingLevel: 'high',
    durationMs: 45_100,
    toolRuns: [
      {
        id: 'demo-tool',
        name: 'powershell',
        label: '执行 PowerShell',
        status: 'success',
        args: { command: 'pnpm test:e2e --filter sync' },
        output:
          '> pi-monitor@1.0.0 test:e2e\n> playwright test tests/e2e/sync --reporter=list\n\nRunning 12 tests using 4 workers\n\n12 passed (1.1m)',
        startedAt: Date.now() - 95_000,
        durationMs: 92_000,
      },
      {
        id: 'demo-edit',
        name: 'edit',
        label: '编辑文件',
        status: 'success',
        args: { path: 'src/services/sync/SyncService.ts' },
        output: 'Applied patch successfully.',
        durationMs: 780,
      },
    ],
  },
]

let snapshot: AgentSnapshot = {
  sessionId: 'demo-session',
  sessionFile: 'demo://session',
  sessionName: '优化数据同步性能',
  project: {
    name: 'pi-monitor',
    path: 'D:\\Projects\\pi-monitor',
    branch: 'main',
    isGit: true,
    dirtyCount: 3,
  },
  recentProjects: [
    {
      name: 'pi-monitor',
      path: 'D:\\Projects\\pi-monitor',
      branch: 'main',
      isGit: true,
      dirtyCount: 3,
    },
    {
      name: 'api-gateway',
      path: 'D:\\Projects\\api-gateway',
      branch: 'develop',
      isGit: true,
      dirtyCount: 0,
    },
  ],
  worktrees: [
    { path: 'D:\\Projects\\pi-monitor', branch: 'main', head: 'f3a20c1', current: true, bare: false },
    { path: 'D:\\Projects\\pi-monitor-auth', branch: 'feature/auth-recovery', head: '72b5ed9', current: false, bare: false },
  ],
  messages,
  forkPoints: [
    {
      entryId: 'demo-entry-user',
      text: messages[0].content,
      timestamp: messages[0].timestamp,
    },
  ],
  sessions: [
    {
      id: 'demo-session',
      path: 'demo://session',
      title: '优化数据同步性能',
      projectPath: 'D:\\Projects\\pi-monitor',
      createdAt: Date.now() - 180_000,
      updatedAt: Date.now(),
      messageCount: 6,
      active: true,
    },
    {
      id: 'demo-2',
      path: 'demo://session-2',
      title: '修复登录态丢失问题',
      projectPath: 'D:\\Projects\\pi-monitor',
      createdAt: Date.now() - 3_600_000,
      updatedAt: Date.now() - 3_600_000,
      messageCount: 8,
    },
    {
      id: 'demo-3',
      path: 'demo://session-3',
      title: '增加导出为 CSV 功能',
      projectPath: 'D:\\Projects\\pi-monitor',
      createdAt: Date.now() - 8_400_000,
      updatedAt: Date.now() - 8_400_000,
      messageCount: 12,
    },
    {
      id: 'demo-4',
      path: 'demo://session-4',
      title: '接入 S3 存储后端',
      projectPath: 'D:\\Projects\\pi-monitor',
      createdAt: Date.now() - 345_600_000,
      updatedAt: Date.now() - 345_600_000,
      messageCount: 16,
    },
    {
      id: 'demo-5',
      path: 'demo://session-5',
      title: '升级依赖到 React 19',
      projectPath: 'D:\\Projects\\pi-monitor',
      createdAt: Date.now() - 432_000_000,
      updatedAt: Date.now() - 432_000_000,
      messageCount: 6,
    },
    {
      id: 'demo-6',
      path: 'demo://session-6',
      title: '梳理网关鉴权流程',
      projectPath: 'D:\\Projects\\api-gateway',
      createdAt: Date.now() - 7_200_000,
      updatedAt: Date.now() - 7_200_000,
      messageCount: 9,
    },
  ],
  changes: [
    {
      path: 'src/services/sync/SyncService.ts',
      status: 'modified',
      additions: 86,
      deletions: 23,
      diff:
        "@@ -128,12 +128,26 @@ async function syncBatch(items: Item[]) {\n-  for (const item of items) {\n-    await db.insert(item)\n-  }\n+  const BATCH_SIZE = 500\n+  for (let i = 0; i < items.length; i += BATCH_SIZE) {\n+    const batch = items.slice(i, i + BATCH_SIZE)\n+    await db.upsert(batch, { onConflict: 'id' })\n+  }",
    },
    {
      path: 'src/db/migrations/20250609_add_sync_index.sql',
      status: 'added',
      additions: 34,
      deletions: 0,
      diff:
        '@@ -0,0 +1,10 @@\n+-- 复合索引：优化用户同步查询\n+CREATE INDEX IF NOT EXISTS idx_sync_user_time\n+  ON sync_records (user_id, updated_at DESC);\n+\n+CREATE INDEX IF NOT EXISTS idx_sync_status\n+  ON sync_records (status);',
    },
    {
      path: 'tests/e2e/sync/sync.performance.spec.ts',
      status: 'modified',
      additions: 62,
      deletions: 10,
      diff:
        "@@ -45,7 +45,12 @@ test('sync performance', async () => {\n-  await syncService.sync(largeDataset)\n+  const start = Date.now()\n+  const result = await syncService.sync(largeDataset, {\n+    concurrency: os.cpus().length * 2,\n+  })\n+  expect(result.duration).toBeLessThan(2000)",
    },
    {
      path: '花生日记/260.py',
      status: 'untracked',
      additions: 3,
      deletions: 0,
      diff: 'diff --git a/花生日记/260.py b/花生日记/260.py\nnew file mode 100644\n--- /dev/null\n+++ b/花生日记/260.py\n@@ -0,0 +1,3 @@\n+from huasheng import Client\n+\n+client = Client()',
      size: 62,
    },
    {
      path: '花生日记/base.apk',
      status: 'untracked',
      additions: 0,
      deletions: 0,
      diff: '',
      binary: true,
      size: 47_812_420,
    },
  ],
  files: fileTree,
  modelKey: 'anthropic/claude-sonnet-4-5',
  thinkingLevel: 'high',
  streaming: false,
  stats: {
    inputTokens: 26_420,
    outputTokens: 5_814,
    cacheReadTokens: 18_900,
    totalTokens: 32_234,
    cost: 0.1732,
    contextTokens: 84_000,
    contextWindow: 200_000,
    contextPercent: 42,
  },
  compaction: { active: false, count: 1, lastAt: Date.now() - 3_600_000, lastTokensBefore: 146_000 },
}

let demoResources: ResourceCatalog = {
  skills: [
    {
      name: 'frontend-app-builder',
      description: '构建并验证现代化桌面与 Web 界面。',
      path: 'D:\\Profiles\\pi\\skills\\frontend-app-builder\\SKILL.md',
      source: 'local',
      scope: 'user',
      origin: 'top-level',
      baseDir: 'D:\\Profiles\\pi',
      enabled: true,
      manageable: true,
      explicitOnly: false,
    },
    {
      name: 'release-check',
      description: '在打包前完成项目级发布检查。',
      path: 'D:\\Projects\\pi-monitor\\.pi\\skills\\release-check\\SKILL.md',
      source: 'local',
      scope: 'project',
      origin: 'top-level',
      baseDir: 'D:\\Projects\\pi-monitor\\.pi',
      enabled: true,
      manageable: true,
      explicitOnly: true,
    },
  ],
  plugins: [
    {
      name: 'git-checkpoint',
      path: 'D:\\Profiles\\pi\\npm\\git-checkpoint\\index.ts',
      source: 'npm:@pi/git-checkpoint@1.4.0',
      scope: 'user',
      origin: 'package',
      baseDir: 'D:\\Profiles\\pi\\npm\\git-checkpoint',
      enabled: true,
      manageable: true,
      hidden: false,
      tools: ['checkpoint'],
      commands: ['checkpoint'],
      shortcuts: 0,
    },
  ],
  packages: [{
    source: 'npm:@pi/git-checkpoint@1.4.0',
    scope: 'user',
    filtered: false,
    installedPath: 'D:\\Profiles\\pi\\npm\\git-checkpoint',
  }],
  issues: [],
}

function emit(event: DesktopEvent): void {
  for (const listener of listeners) listener(event)
}

function cloneSnapshot(): AgentSnapshot {
  return structuredClone(snapshot)
}

export function createDemoBridge(): DesktopBridge {
  return {
    async bootstrap(): Promise<AppBootstrap> {
      return {
        version: '0.1.0-demo',
        platform: 'browser',
        demoMode: true,
        recentProjects: snapshot.recentProjects,
        providers,
        models,
        snapshot: cloneSnapshot(),
      }
    },
    async chooseProject() {
      return cloneSnapshot()
    },
    async openProject(projectPath: string) {
      const project = snapshot.recentProjects.find((item) => item.path === projectPath)
      if (project) snapshot = { ...snapshot, project }
      return cloneSnapshot()
    },
    async refreshWorkspace() {
      return { project: snapshot.project, changes: snapshot.changes, files: snapshot.files, worktrees: snapshot.worktrees }
    },
    async openWorkspaceFile() {},
    async previewWorkspaceFile(filePath: string) {
      if (filePath.endsWith('.md')) {
        return {
          path: filePath,
          name: filePath.split('/').at(-1) ?? filePath,
          kind: 'markdown' as const,
          mimeType: 'text/markdown',
          size: 286,
          content: '# Pi Monitor\n\n本项目负责用户数据的增量同步与性能监控。\n\n## 开发\n\n```bash\npnpm test:e2e --filter sync\n```',
        }
      }
      return {
        path: filePath,
        name: filePath.split('/').at(-1) ?? filePath,
        kind: 'text' as const,
        mimeType: 'text/plain',
        size: 412,
        content: `// ${filePath}\n\nexport async function syncBatch(items: Item[]) {\n  return database.upsert(items)\n}\n`,
      }
    },
    async createSession(projectPath?: string) {
      const project = snapshot.recentProjects.find((item) => item.path === projectPath) ?? snapshot.project
      snapshot = {
        ...snapshot,
        project,
        sessionId: `demo-${Date.now()}`,
        sessionName: '新任务',
        messages: [],
        forkPoints: [],
        streaming: false,
      }
      return cloneSnapshot()
    },
    async openSession(sessionPath: string, projectPath?: string) {
      const session = snapshot.sessions.find((item) => item.path === sessionPath)
      const project = snapshot.recentProjects.find((item) => item.path === (projectPath ?? session?.projectPath)) ?? snapshot.project
      snapshot = {
        ...snapshot,
        project,
        sessionId: session?.id ?? snapshot.sessionId,
        sessionName: session?.title ?? snapshot.sessionName,
        sessions: snapshot.sessions.map((session) => ({ ...session, active: session.path === sessionPath })),
      }
      return cloneSnapshot()
    },
    async setSessionArchived(sessionPath: string, projectPath: string, archived: boolean) {
      const active = snapshot.sessions.some((session) => session.path === sessionPath && session.active)
      snapshot = {
        ...snapshot,
        sessions: snapshot.sessions.map((session) => session.path === sessionPath ? { ...session, archived } : session),
      }
      if (active && archived) {
        const sessionId = `demo-${Date.now()}`
        snapshot = {
          ...snapshot,
          project: snapshot.recentProjects.find((item) => item.path === projectPath) ?? snapshot.project,
          sessionId,
          sessionFile: `demo://${sessionId}`,
          sessionName: '新任务',
          messages: [],
          forkPoints: [],
          sessions: [
            { id: sessionId, path: `demo://${sessionId}`, title: '新任务', projectPath, createdAt: Date.now(), updatedAt: Date.now(), messageCount: 0, active: true },
            ...snapshot.sessions.map((session) => ({ ...session, active: false })),
          ],
        }
      }
      return cloneSnapshot()
    },
    async deleteSession(sessionPath: string, projectPath: string) {
      const active = snapshot.sessions.some((session) => session.path === sessionPath && session.active)
      snapshot = { ...snapshot, sessions: snapshot.sessions.filter((session) => session.path !== sessionPath) }
      if (active) {
        const sessionId = `demo-${Date.now()}`
        snapshot = {
          ...snapshot,
          project: snapshot.recentProjects.find((item) => item.path === projectPath) ?? snapshot.project,
          sessionId,
          sessionFile: `demo://${sessionId}`,
          sessionName: '新任务',
          messages: [],
          forkPoints: [],
          sessions: [
            { id: sessionId, path: `demo://${sessionId}`, title: '新任务', projectPath, createdAt: Date.now(), updatedAt: Date.now(), messageCount: 0, active: true },
            ...snapshot.sessions,
          ],
        }
      }
      return cloneSnapshot()
    },
    async renameSession(name: string) {
      snapshot = { ...snapshot, sessionName: name }
    },
    async branchSession(entryId: string) {
      const point = snapshot.forkPoints.find((item) => item.entryId === entryId)
      if (!point) throw new Error('找不到可分支的历史消息。')
      snapshot = { ...snapshot, messages: [], forkPoints: [] }
      return { snapshot: cloneSnapshot(), editorText: point.text }
    },
    async forkSession(entryId: string) {
      const point = snapshot.forkPoints.find((item) => item.entryId === entryId)
      if (!point) throw new Error('找不到可 Fork 的历史消息。')
      const sessionId = `demo-fork-${Date.now()}`
      snapshot = {
        ...snapshot,
        sessionId,
        sessionFile: `demo://${sessionId}`,
        sessionName: 'Fork · 优化数据同步性能',
        messages: [],
        forkPoints: [],
        sessions: [
          {
            id: sessionId,
            path: `demo://${sessionId}`,
            title: 'Fork · 优化数据同步性能',
            projectPath: snapshot.project.path,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messageCount: 0,
            active: true,
          },
          ...snapshot.sessions.map((session) => ({ ...session, active: false })),
        ],
      }
      return { snapshot: cloneSnapshot(), editorText: point.text }
    },
    async compactSession() {
      emit({ type: 'compaction:status', compaction: { ...snapshot.compaction, active: true, reason: 'manual' } })
      snapshot = {
        ...snapshot,
        stats: {
          ...snapshot.stats,
          contextTokens: Math.round((snapshot.stats.contextTokens ?? 0) * 0.42),
          contextPercent: Math.round((snapshot.stats.contextPercent ?? 0) * 0.42),
        },
        compaction: {
          active: false,
          count: snapshot.compaction.count + 1,
          reason: 'manual',
          lastAt: Date.now(),
          lastTokensBefore: snapshot.stats.contextTokens ?? undefined,
        },
      }
      emit({ type: 'compaction:status', compaction: snapshot.compaction })
      return cloneSnapshot()
    },
    async sendPrompt(text: string, _behavior, autoNamingMode = 'smart', images = [], promptId?: string) {
      void images
      if (text.includes('[demo-fail]')) {
        window.setTimeout(() => emit({ type: 'prompt:failed', promptId: promptId ?? 'missing', message: '无法连接模型服务，请检查网络后重试。' }), 80)
        return
      }
      const messageId = `demo-assistant-${Date.now()}`
      const startedAt = Date.now()
      if ((!snapshot.sessionName || snapshot.sessionName === '新任务') && autoNamingMode !== 'off') {
        const name = provisionalSessionTitle(text)
        snapshot = { ...snapshot, sessionName: name }
        emit({ type: 'session:name', sessionId: snapshot.sessionId ?? 'demo-session', name })
      }
      emit({ type: 'agent:status', streaming: true })
      emit({
        type: 'message:start',
        message: {
          id: messageId,
          role: 'assistant',
          content: '',
          timestamp: startedAt,
          status: 'streaming',
          provider: 'anthropic',
          model: 'claude-sonnet-4-5',
          thinkingLevel: snapshot.thinkingLevel,
          toolRuns: [],
        },
      })
      const reply = `收到。我会在当前工作区中处理“${text.slice(0, 42)}${text.length > 42 ? '…' : ''}”，并把每一步工具执行和文件变更展示在这里。`
      let offset = 0
      const timer = window.setInterval(() => {
        const delta = reply.slice(offset, offset + 5)
        offset += 5
        if (delta) emit({ type: 'message:delta', messageId, delta, channel: 'text' })
        if (offset >= reply.length) {
          window.clearInterval(timer)
          emit({
            type: 'message:end',
            messageId,
            message: {
              id: messageId,
              role: 'assistant',
              content: reply,
              timestamp: startedAt,
              status: 'complete',
              provider: 'anthropic',
              model: 'claude-sonnet-4-5',
              thinkingLevel: snapshot.thinkingLevel,
              durationMs: Date.now() - startedAt,
              toolRuns: [],
            },
          })
          if (autoNamingMode === 'smart' && snapshot.sessionId) {
            const sessionId = snapshot.sessionId
            const name = text.includes('同步') ? '优化数据同步性能' : provisionalSessionTitle(text)
            snapshot = { ...snapshot, sessionName: name }
            emit({ type: 'session:name', sessionId, name })
          }
          emit({ type: 'agent:status', streaming: false })
        }
      }, 45)
    },
    async abortAgent() {
      emit({ type: 'agent:status', streaming: false })
    },
    async setModel(key: string, thinkingLevel: ThinkingLevel) {
      snapshot = { ...snapshot, modelKey: key, thinkingLevel }
      return cloneSnapshot()
    },
    async saveProviderKey(providerId: string) {
      const nextProviders = providers.map((provider) =>
        provider.id === providerId ? { ...provider, authenticated: true, authLabel: 'PiLens 加密存储' } : provider,
      )
      return {
        providers: nextProviders,
        models: models.map((model) => model.provider === providerId ? { ...model, authenticated: true } : model),
      }
    },
    async refreshModels() {
      return { providers, models }
    },
    async loginProvider(providerId: string) {
      const provider = providers.find((item) => item.id === providerId)
      if (!provider) throw new Error('未找到 Provider。')
      const generation = ++demoAuthGeneration
      const flowId = crypto.randomUUID()
      emit({
        type: 'auth:start',
        flow: { id: flowId, providerId, providerName: provider.name, notices: [] },
      })
      emit({
        type: 'auth:event',
        flowId,
        event: {
          type: 'auth_url',
          url: 'https://example.com/oauth/authorize',
          instructions: '预览模式正在模拟系统浏览器授权；桌面版会打开 Provider 官方登录页。',
        },
      })
      emit({ type: 'auth:event', flowId, event: { type: 'progress', message: '等待浏览器完成授权…' } })
      await new Promise((resolve) => window.setTimeout(resolve, 900))
      if (generation !== demoAuthGeneration) throw new Error('登录已取消。')
      const catalog = {
        providers: providers.map((item) => item.id === providerId
          ? { ...item, authenticated: true, authLabel: 'OAuth', usingOAuth: true }
          : item),
        models: models.map((model) => model.provider === providerId ? { ...model, authenticated: true } : model),
      }
      emit({ type: 'models:update', ...catalog })
      emit({ type: 'auth:complete', flowId, success: true, message: `${provider.name} 已连接。` })
      return catalog
    },
    async answerAuthPrompt() {},
    async cancelProviderLogin() {
      demoAuthGeneration += 1
    },
    async disconnectProvider(providerId: string) {
      return {
        providers: providers.map((provider) => provider.id === providerId
          ? { ...provider, authenticated: false, authLabel: '未连接', usingOAuth: false }
          : provider),
        models: models.map((model) => model.provider === providerId ? { ...model, authenticated: false } : model),
      }
    },
    async getCustomModels() {
      return []
    },
    async saveCustomModel(model) {
      const customProvider: ProviderOption = {
        id: model.providerId,
        name: model.providerName,
        authenticated: model.localNoAuth,
        authLabel: model.localNoAuth ? '本地服务' : '需要 API Key',
        authMethods: ['api_key'],
        usingOAuth: false,
      }
      const customModel: ModelOption = {
        key: `${model.providerId}/${model.modelId}`,
        id: model.modelId,
        name: model.modelName,
        provider: model.providerId,
        providerName: model.providerName,
        authenticated: model.localNoAuth,
        reasoning: model.reasoning,
        imageInput: model.imageInput,
        thinkingLevels: model.reasoning ? ['off', 'low', 'medium', 'high'] : ['off'],
        contextWindow: model.contextWindow,
        maxTokens: model.maxTokens,
      }
      return { customModels: [model], providers: [...providers, customProvider], models: [...models, customModel] }
    },
    async deleteCustomModel() {
      return { customModels: [], providers, models }
    },
    async getResources() {
      return structuredClone(demoResources)
    },
    async reloadResources() {
      return this.getResources()
    },
    async openResource() {},
    async setResourceEnabled(request) {
      demoResources = {
        ...demoResources,
        skills: demoResources.skills.map((resource) => resource.path === request.path ? { ...resource, enabled: request.enabled } : resource),
        plugins: demoResources.plugins.map((resource) => resource.path === request.path ? { ...resource, enabled: request.enabled } : resource),
      }
      return structuredClone(demoResources)
    },
    async installResourcePackage(source, scope) {
      emit({ type: 'resources:progress', progress: { action: 'install', source, message: '正在安装资源包…' } })
      await new Promise((resolve) => window.setTimeout(resolve, 320))
      if (!demoResources.packages.some((item) => item.source === source && item.scope === scope)) {
        demoResources = {
          ...demoResources,
          packages: [...demoResources.packages, { source, scope, filtered: false, installedPath: scope === 'project' ? `D:\\Projects\\pi-monitor\\.pi\\packages\\${source}` : `D:\\Profiles\\pi\\packages\\${source}` }],
        }
      }
      emit({ type: 'resources:progress', progress: undefined })
      return structuredClone(demoResources)
    },
    async removeResourcePackage(source, scope) {
      demoResources = {
        ...demoResources,
        packages: demoResources.packages.filter((item) => item.source !== source || item.scope !== scope),
        skills: demoResources.skills.filter((item) => item.source !== source),
        plugins: demoResources.plugins.filter((item) => item.source !== source),
      }
      return structuredClone(demoResources)
    },
    async updateResourcePackage(source) {
      emit({ type: 'resources:progress', progress: { action: 'update', source: source ?? '全部资源包', message: '正在检查更新…' } })
      await new Promise((resolve) => window.setTimeout(resolve, 260))
      emit({ type: 'resources:progress', progress: undefined })
      return structuredClone(demoResources)
    },
    async createResourceTemplate(input) {
      const root = input.scope === 'project' ? 'D:\\Projects\\pi-monitor\\.pi' : 'D:\\Profiles\\pi'
      if (input.kind === 'skill') {
        demoResources = { ...demoResources, skills: [...demoResources.skills, { name: input.name, description: input.description, path: `${root}\\skills\\${input.name}\\SKILL.md`, source: 'local', scope: input.scope, origin: 'top-level', baseDir: root, enabled: true, manageable: true, explicitOnly: false }] }
      } else {
        demoResources = { ...demoResources, plugins: [...demoResources.plugins, { name: input.name, path: `${root}\\extensions\\${input.name}.ts`, source: 'local', scope: input.scope, origin: 'top-level', baseDir: root, enabled: true, manageable: true, hidden: false, tools: [], commands: [input.name], shortcuts: 0 }] }
      }
      return structuredClone(demoResources)
    },
    minimizeWindow() {},
    toggleMaximizeWindow() {},
    closeWindow() {},
    playCompletionSound() {},
    onEvent(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
