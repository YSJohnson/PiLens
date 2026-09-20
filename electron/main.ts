import { app, BrowserWindow, dialog, ipcMain, Notification, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  IPC,
  type AgentSnapshot,
  type AutoNamingMode,
  type CustomModelConfig,
  type DesktopEvent,
  type PromptImage,
  type ProjectInfo,
  type ResourceTemplateInput,
  type ResourceToggleRequest,
  type ThinkingLevel,
} from '../src/shared/contracts'
import { PiService } from './pi-service'
import { SettingsStore } from './settings-store'
import { WorkspaceService } from './workspace-service'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
let mainWindow: BrowserWindow | null = null
let settings: SettingsStore
let workspace: WorkspaceService
let pi: PiService
let activeContext: PiContext

interface PiContext {
  service: PiService
  projectPath?: string
}

const piContexts = new Set<PiContext>()
const projectInfoCache = new Map<string, ProjectInfo>()

function samePath(left?: string, right?: string): boolean {
  return Boolean(left && right && path.resolve(left).toLocaleLowerCase() === path.resolve(right).toLocaleLowerCase())
}

function hasStreamingSessions(): boolean {
  return [...piContexts].some((context) => context.service.isStreaming)
}

function sendEvent(event: DesktopEvent): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send(IPC.event, event)

  if (event.type === 'auth:event') {
    const externalUrl = event.event.type === 'auth_url'
      ? event.event.url
      : event.event.type === 'device_code' ? event.event.verificationUri : undefined
    if (externalUrl && /^https?:\/\//i.test(externalUrl)) void shell.openExternal(externalUrl)
  }

  if (event.type === 'agent:status' || event.type === 'session:status') {
    if (hasStreamingSessions()) {
      mainWindow.setProgressBar(2, { mode: 'indeterminate' })
    } else {
      mainWindow.setProgressBar(-1)
      if (!event.streaming && !mainWindow.isFocused()) mainWindow.flashFrame(true)
    }
  }
}

function handlePiEvent(context: PiContext, event: DesktopEvent): void {
  if (event.type === 'agent:status' && context.projectPath) {
    sendEvent({
      type: 'session:status',
      sessionId: context.service.sessionId,
      sessionFile: context.service.sessionFile,
      projectPath: context.projectPath,
      streaming: event.streaming,
    })
  }
  if (context === activeContext || event.type === 'session:name' || event.type === 'app:error') sendEvent(event)
}

async function createPiContext(projectPath?: string): Promise<PiContext> {
  const context = {} as PiContext
  context.projectPath = projectPath
  context.service = new PiService(
    settings,
    (event) => handlePiEvent(context, event),
    () => void handleAgentSettled(context),
  )
  await context.service.initialize()
  piContexts.add(context)
  return context
}

function findSessionContext(sessionFile: string): PiContext | undefined {
  return [...piContexts].find((context) => samePath(context.service.sessionFile, sessionFile))
}

function discardIdleContexts(keep: PiContext): void {
  for (const context of piContexts) {
    if (context === keep || context.service.isStreaming) continue
    context.service.dispose()
    piContexts.delete(context)
  }
}

async function rememberActiveSession(): Promise<void> {
  if (workspace.path && pi.sessionFile) await settings.setLastSession(workspace.path, pi.sessionFile)
}

async function getRecentProjects(current?: ProjectInfo, describeMissing = true): Promise<ProjectInfo[]> {
  if (current) projectInfoCache.set(current.path, current)
  const projectPaths = settings.getRecentProjects()
  return (await Promise.all(projectPaths.map(async (projectPath) => {
    const cached = projectInfoCache.get(projectPath)
    if (cached) return cached
    if (!describeMissing) return { name: path.basename(projectPath), path: projectPath, isGit: false, dirtyCount: 0 }
    try {
      const project = await workspace.describe(projectPath)
      projectInfoCache.set(projectPath, project)
      return project
    } catch {
      return undefined
    }
  }))).filter((project): project is ProjectInfo => Boolean(project))
}

async function getAllSessions(projects: ProjectInfo[]) {
  const sessions = (await Promise.all(projects.map((project) =>
    pi.listSessions(project.path).catch(() => []),
  ))).flat()
  return sessions.map((session) => {
    const context = findSessionContext(session.path)
    return {
      ...session,
      active: samePath(session.path, pi.sessionFile),
      streaming: context?.service.isStreaming || undefined,
      archived: settings.isSessionArchived(session.path) || undefined,
    }
  })
}

async function buildSnapshot(includeWorkspaceDetails = true, knownProject?: ProjectInfo): Promise<AgentSnapshot> {
  const [workspaceSnapshot, core] = await Promise.all([
    includeWorkspaceDetails
      ? workspace.snapshot(knownProject)
      : knownProject
        ? Promise.resolve({ project: knownProject, changes: [], files: [], worktrees: [] })
        : workspace.describe().then((project) => ({ project, changes: [], files: [], worktrees: [] })),
    pi.snapshot(),
  ])
  const recentProjects = await getRecentProjects(workspaceSnapshot.project, includeWorkspaceDetails)
  return {
    ...core,
    ...workspaceSnapshot,
    recentProjects,
    sessions: await getAllSessions(recentProjects),
  }
}

async function publishSnapshot(): Promise<void> {
  try {
    await rememberActiveSession()
    const snapshot = await buildSnapshot()
    sendEvent({ type: 'session:snapshot', snapshot })
  } catch (error) {
    sendEvent({
      type: 'app:error',
      title: '刷新会话失败',
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

async function publishWorkspaceDetails(expectedProjectPath: string): Promise<void> {
  try {
    const snapshot = await workspace.snapshot()
    if (!samePath(workspace.path, expectedProjectPath)) return
    sendEvent({ type: 'workspace:update', ...snapshot })
  } catch {
    // The lightweight bootstrap is still usable; the user can retry from Refresh.
  }
}

async function handleAgentSettled(context: PiContext): Promise<void> {
  if (!hasStreamingSessions()) await settings.clearRunningSession()
  if ((context !== activeContext || !mainWindow?.isFocused()) && Notification.isSupported()) {
    new Notification({
      title: 'PiLens 任务已完成',
      body: `${context.service.sessionName ?? path.basename(context.projectPath ?? '当前项目')} 已结束运行。`,
    }).show()
  }
  if (context === activeContext) await publishSnapshot()
}

async function resolveSession(projectPath: string, sessionPath: string) {
  const sessions = await pi.listSessions(projectPath)
  const session = sessions.find((candidate) => samePath(candidate.path, sessionPath))
  if (!session) throw new Error('找不到这个会话。')
  return session
}

async function activateProject(projectPath: string, preferredSession?: string, includeWorkspaceDetails = true): Promise<AgentSnapshot> {
  const sessionFile = preferredSession ?? settings.getLastSession(projectPath)
  const existing = sessionFile ? findSessionContext(sessionFile) : undefined
  let currentProject: ProjectInfo
  if (existing) {
    currentProject = await workspace.setProject(projectPath)
    existing.projectPath = projectPath
    activeContext = existing
    pi = existing.service
    discardIdleContexts(existing)
  } else {
    const previous = activeContext
    const context = previous && !previous.service.isStreaming
      ? previous
      : await createPiContext(projectPath)
    try {
      if (sessionFile) {
        try {
          await context.service.openSession(projectPath, sessionFile)
        } catch {
          await context.service.openMostRecentOrCreate(projectPath)
        }
      } else {
        await context.service.openMostRecentOrCreate(projectPath)
      }
    } catch (error) {
      if (context !== previous) {
        context.service.dispose()
        piContexts.delete(context)
      }
      throw error
    }
    currentProject = await workspace.setProject(projectPath)
    context.projectPath = projectPath
    activeContext = context
    pi = context.service
    discardIdleContexts(context)
  }
  await settings.touchProject(projectPath)
  await rememberActiveSession()
  return buildSnapshot(includeWorkspaceDetails, currentProject)
}

async function activateSession(projectPath: string, sessionFile: string): Promise<AgentSnapshot> {
  const existing = findSessionContext(sessionFile)
  if (existing) {
    await workspace.setProject(projectPath)
    existing.projectPath = projectPath
    activeContext = existing
    pi = existing.service
    discardIdleContexts(existing)
    await settings.touchProject(projectPath)
    await rememberActiveSession()
    return buildSnapshot()
  }

  const previous = activeContext
  const context = previous && !previous.service.isStreaming
    ? previous
    : await createPiContext(projectPath)
  try {
    await context.service.openSession(projectPath, sessionFile)
    await workspace.setProject(projectPath)
  } catch (error) {
    if (context !== previous) {
      context.service.dispose()
      piContexts.delete(context)
    }
    throw error
  }
  context.projectPath = projectPath
  activeContext = context
  pi = context.service
  discardIdleContexts(context)
  await settings.touchProject(projectPath)
  await rememberActiveSession()
  return buildSnapshot()
}

async function createSession(projectPath: string): Promise<AgentSnapshot> {
  const previous = activeContext
  const context = previous && !previous.service.isStreaming
    ? previous
    : await createPiContext(projectPath)
  try {
    await context.service.createSession(projectPath)
    await workspace.setProject(projectPath)
  } catch (error) {
    if (context !== previous) {
      context.service.dispose()
      piContexts.delete(context)
    }
    throw error
  }
  context.projectPath = projectPath
  activeContext = context
  pi = context.service
  discardIdleContexts(context)
  await settings.touchProject(projectPath)
  await rememberActiveSession()
  return buildSnapshot()
}

function registerIpc(): void {
  ipcMain.handle(IPC.bootstrap, async () => {
    const interruptedRun = await settings.consumeInterruptedRun()
    const projectPaths = interruptedRun
      ? [interruptedRun.projectPath, ...settings.getRecentProjects().filter((item) => item !== interruptedRun.projectPath)]
      : settings.getRecentProjects()
    let snapshot: AgentSnapshot | undefined
    for (const projectPath of projectPaths) {
      try {
        snapshot = await activateProject(
          projectPath,
          samePath(projectPath, interruptedRun?.projectPath) ? interruptedRun?.sessionFile : undefined,
          false,
        )
        break
      } catch {
        snapshot = undefined
      }
    }

    const catalog = await pi.getCatalog()
    if (snapshot) {
      const projectPath = snapshot.project.path
      setTimeout(() => void publishWorkspaceDetails(projectPath), 350)
    }
    return {
      version: app.getVersion(),
      platform: process.platform,
      demoMode: false,
      recentProjects: snapshot?.recentProjects ?? [],
      ...catalog,
      recoveryNotice: interruptedRun
        ? '已恢复上次工作区和会话。上次进行中的回复因应用关闭而停止，你可以从原处继续。'
        : undefined,
      snapshot,
    }
  })

  ipcMain.handle(IPC.chooseProject, async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: '选择 Pi 工作区',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) return null
    return activateProject(result.filePaths[0])
  })

  ipcMain.handle(IPC.openProject, async (_event, projectPath: string) => activateProject(projectPath))
  ipcMain.handle(IPC.refreshWorkspace, async () => workspace.snapshot())
  ipcMain.handle(IPC.openWorkspaceFile, async (_event, filePath: string) => workspace.openFile(filePath))
  ipcMain.handle(IPC.previewWorkspaceFile, async (_event, filePath: string) => workspace.previewFile(filePath))
  ipcMain.handle(IPC.createSession, async (_event, projectPath?: string) => {
    const targetProject = projectPath ?? workspace.path
    if (!targetProject) throw new Error('请先选择项目。')
    return createSession(targetProject)
  })
  ipcMain.handle(IPC.openSession, async (_event, sessionPath: string, projectPath?: string) => {
    const targetProject = projectPath ?? workspace.path
    if (!targetProject) throw new Error('请先选择项目。')
    return activateSession(targetProject, sessionPath)
  })
  ipcMain.handle(IPC.setSessionArchived, async (_event, sessionPath: string, projectPath: string, archived: boolean) => {
    const session = await resolveSession(projectPath, sessionPath)
    const context = findSessionContext(session.path)
    if (context?.service.isStreaming) throw new Error('任务正在运行，结束后才能归档。')
    await settings.setSessionArchived(session.path, archived)
    if (archived && samePath(session.path, pi.sessionFile)) return createSession(projectPath)
    return buildSnapshot()
  })
  ipcMain.handle(IPC.deleteSession, async (_event, sessionPath: string, projectPath: string) => {
    const session = await resolveSession(projectPath, sessionPath)
    const context = findSessionContext(session.path)
    if (context?.service.isStreaming) throw new Error('任务正在运行，结束后才能删除。')
    if (samePath(session.path, pi.sessionFile)) await createSession(projectPath)
    else if (context) {
      context.service.dispose()
      piContexts.delete(context)
    }
    await shell.trashItem(session.path)
    await settings.setSessionArchived(session.path, false)
    return buildSnapshot()
  })
  ipcMain.handle(IPC.renameSession, async (_event, name: string) => {
    pi.renameSession(name)
    await publishSnapshot()
  })
  ipcMain.handle(IPC.branchSession, async (_event, entryId: string) => {
    const editorText = await pi.branchSession(entryId)
    await rememberActiveSession()
    return { snapshot: await buildSnapshot(), editorText }
  })
  ipcMain.handle(IPC.forkSession, async (_event, entryId: string) => {
    const editorText = await pi.forkSession(entryId)
    await rememberActiveSession()
    return { snapshot: await buildSnapshot(), editorText }
  })
  ipcMain.handle(IPC.compactSession, async () => {
    await pi.compactSession()
    return buildSnapshot()
  })
  ipcMain.handle(IPC.sendPrompt, async (_event, text: string, behavior?: 'steer' | 'followUp', autoNamingMode?: AutoNamingMode, images?: PromptImage[], promptId?: string) => {
    if (!workspace.path) throw new Error('请先选择项目。')
    await settings.markRunningSession(activeContext.projectPath ?? workspace.path, pi.sessionFile)
    await pi.sendPrompt(text, behavior, autoNamingMode, images, promptId)
  })
  ipcMain.handle(IPC.abortAgent, async () => {
    await pi.abort()
    if (!hasStreamingSessions()) await settings.clearRunningSession()
  })
  ipcMain.handle(IPC.setModel, async (_event, key: string, thinkingLevel: ThinkingLevel) => {
    await pi.setModel(key, thinkingLevel)
    return buildSnapshot()
  })
  ipcMain.handle(IPC.saveProviderKey, async (_event, providerId: string, apiKey: string, remember: boolean) =>
    pi.saveProviderKey(providerId, apiKey, remember),
  )
  ipcMain.handle(IPC.refreshModels, async () => pi.refreshModels())
  ipcMain.handle(IPC.loginProvider, async (_event, providerId: string) => pi.loginProvider(providerId))
  ipcMain.handle(IPC.answerAuthPrompt, async (_event, flowId: string, promptId: string, value?: string) =>
    pi.answerAuthPrompt(flowId, promptId, value),
  )
  ipcMain.handle(IPC.cancelProviderLogin, async (_event, flowId: string) => pi.cancelProviderLogin(flowId))
  ipcMain.handle(IPC.disconnectProvider, async (_event, providerId: string) => pi.disconnectProvider(providerId))
  ipcMain.handle(IPC.getCustomModels, async () => pi.getCustomModels())
  ipcMain.handle(IPC.saveCustomModel, async (_event, model: CustomModelConfig) => pi.saveCustomModel(model))
  ipcMain.handle(IPC.deleteCustomModel, async (_event, providerId: string, modelId: string) => pi.deleteCustomModel(providerId, modelId))
  ipcMain.handle(IPC.getResources, async () => pi.getResources())
  ipcMain.handle(IPC.reloadResources, async () => pi.reloadResources())
  ipcMain.handle(IPC.setResourceEnabled, async (_event, request: ResourceToggleRequest) => pi.setResourceEnabled(request))
  ipcMain.handle(IPC.installResourcePackage, async (_event, source: string, scope: 'user' | 'project') => pi.installResourcePackage(source, scope))
  ipcMain.handle(IPC.removeResourcePackage, async (_event, source: string, scope: 'user' | 'project') => pi.removeResourcePackage(source, scope))
  ipcMain.handle(IPC.updateResourcePackage, async (_event, source?: string) => pi.updateResourcePackage(source))
  ipcMain.handle(IPC.createResourceTemplate, async (_event, input: ResourceTemplateInput) => pi.createResourceTemplate(input))
  ipcMain.handle(IPC.openResource, async (_event, resourcePath: string) => {
    const error = await shell.openPath(await pi.resolveResourcePath(resourcePath))
    if (error) throw new Error(error)
  })

  ipcMain.on(IPC.windowMinimize, () => mainWindow?.minimize())
  ipcMain.on(IPC.windowToggleMaximize, () => {
    if (!mainWindow) return
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
  })
  ipcMain.on(IPC.windowClose, () => mainWindow?.close())
  ipcMain.on(IPC.completionSound, () => shell.beep())
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1580,
    height: 960,
    minWidth: 920,
    minHeight: 640,
    show: false,
    frame: false,
    icon: path.join(app.getAppPath(), 'build/icon.png'),
    backgroundColor: '#0d0e11',
    webPreferences: {
      preload: path.join(currentDirectory, '../preload/preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('focus', () => mainWindow?.flashFrame(false))
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(path.join(currentDirectory, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  settings = new SettingsStore()
  workspace = new WorkspaceService()
  await settings.load()
  activeContext = await createPiContext()
  pi = activeContext.service
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  for (const context of piContexts) context.service.dispose()
  piContexts.clear()
  if (process.platform !== 'darwin') app.quit()
})
