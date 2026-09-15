import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  IPC,
  type AgentSnapshot,
  type AutoNamingMode,
  type CustomModelConfig,
  type DesktopEvent,
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

function sendEvent(event: DesktopEvent): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send(IPC.event, event)

  if (event.type === 'auth:event') {
    const externalUrl = event.event.type === 'auth_url'
      ? event.event.url
      : event.event.type === 'device_code' ? event.event.verificationUri : undefined
    if (externalUrl && /^https?:\/\//i.test(externalUrl)) void shell.openExternal(externalUrl)
  }

  if (event.type === 'agent:status') {
    if (event.streaming) {
      mainWindow.setProgressBar(2, { mode: 'indeterminate' })
    } else {
      mainWindow.setProgressBar(-1)
      if (!mainWindow.isFocused()) mainWindow.flashFrame(true)
    }
  }
}

async function rememberActiveSession(): Promise<void> {
  if (workspace.path && pi.sessionFile) await settings.setLastSession(workspace.path, pi.sessionFile)
}

async function buildSnapshot(): Promise<AgentSnapshot> {
  const [workspaceSnapshot, core] = await Promise.all([workspace.snapshot(), pi.snapshot()])
  return {
    ...core,
    ...workspaceSnapshot,
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

async function handleAgentSettled(): Promise<void> {
  await settings.clearRunningSession()
  await publishSnapshot()
}

async function activateProject(projectPath: string, preferredSession?: string): Promise<AgentSnapshot> {
  if (pi.isStreaming) throw new Error('Pi 正在运行，请等待当前回复完成后再切换项目或 worktree。')
  await workspace.setProject(projectPath)
  await settings.touchProject(projectPath)
  const sessionFile = preferredSession ?? settings.getLastSession(projectPath)
  if (sessionFile) {
    try {
      await pi.openSession(projectPath, sessionFile)
    } catch {
      await pi.openMostRecentOrCreate(projectPath)
    }
  } else {
    await pi.openMostRecentOrCreate(projectPath)
  }
  await rememberActiveSession()
  return buildSnapshot()
}

function registerIpc(): void {
  ipcMain.handle(IPC.bootstrap, async () => {
    const interruptedRun = await settings.consumeInterruptedRun()
    const projectPaths = interruptedRun
      ? [interruptedRun.projectPath, ...settings.getRecentProjects().filter((item) => item !== interruptedRun.projectPath)]
      : settings.getRecentProjects()
    const recentProjects = (
      await Promise.all(
        projectPaths.map(async (projectPath) => {
          try {
            return await workspace.describe(projectPath)
          } catch {
            return undefined
          }
        }),
      )
    ).filter((project): project is NonNullable<typeof project> => Boolean(project))

    let snapshot: AgentSnapshot | undefined
    if (recentProjects[0]) {
      try {
        snapshot = await activateProject(
          recentProjects[0].path,
          recentProjects[0].path === interruptedRun?.projectPath ? interruptedRun.sessionFile : undefined,
        )
      } catch {
        snapshot = undefined
      }
    }

    const catalog = await pi.getCatalog()
    return {
      version: app.getVersion(),
      platform: process.platform,
      demoMode: false,
      recentProjects,
      ...catalog,
      recoveryNotice: interruptedRun
        ? '已恢复上次工作区和会话。上次进行中的回复因应用关闭而停止，你可以从原处继续。'
        : undefined,
      snapshot,
    }
  })

  ipcMain.handle(IPC.chooseProject, async () => {
    if (pi.isStreaming) throw new Error('Pi 正在运行，请等待当前回复完成后再切换项目。')
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
  ipcMain.handle(IPC.createSession, async () => {
    if (!workspace.path) throw new Error('请先选择项目。')
    await pi.createSession(workspace.path)
    return buildSnapshot()
  })
  ipcMain.handle(IPC.openSession, async (_event, sessionPath: string) => {
    if (!workspace.path) throw new Error('请先选择项目。')
    await pi.openSession(workspace.path, sessionPath)
    await rememberActiveSession()
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
  ipcMain.handle(IPC.sendPrompt, async (_event, text: string, behavior?: 'steer' | 'followUp', autoNamingMode?: AutoNamingMode) => {
    if (!workspace.path) throw new Error('请先选择项目。')
    await settings.markRunningSession(workspace.path, pi.sessionFile)
    await pi.sendPrompt(text, behavior, autoNamingMode)
  })
  ipcMain.handle(IPC.abortAgent, async () => {
    await pi.abort()
    await settings.clearRunningSession()
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
  pi = new PiService(settings, sendEvent, () => void handleAgentSettled())
  await pi.initialize()
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  pi?.dispose()
  if (process.platform !== 'darwin') app.quit()
})
