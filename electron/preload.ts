import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type CustomModelConfig, type DesktopBridge, type DesktopEvent, type ThinkingLevel } from '../src/shared/contracts'

const bridge: DesktopBridge = {
  bootstrap: () => ipcRenderer.invoke(IPC.bootstrap),
  chooseProject: () => ipcRenderer.invoke(IPC.chooseProject),
  openProject: (path: string) => ipcRenderer.invoke(IPC.openProject, path),
  refreshWorkspace: () => ipcRenderer.invoke(IPC.refreshWorkspace),
  openWorkspaceFile: (path: string) => ipcRenderer.invoke(IPC.openWorkspaceFile, path),
  previewWorkspaceFile: (path: string) => ipcRenderer.invoke(IPC.previewWorkspaceFile, path),
  createSession: (projectPath?: string) => ipcRenderer.invoke(IPC.createSession, projectPath),
  openSession: (path: string, projectPath?: string) => ipcRenderer.invoke(IPC.openSession, path, projectPath),
  setSessionArchived: (path: string, projectPath: string, archived: boolean) => ipcRenderer.invoke(IPC.setSessionArchived, path, projectPath, archived),
  deleteSession: (path: string, projectPath: string) => ipcRenderer.invoke(IPC.deleteSession, path, projectPath),
  renameSession: (name: string) => ipcRenderer.invoke(IPC.renameSession, name),
  branchSession: (entryId: string) => ipcRenderer.invoke(IPC.branchSession, entryId),
  forkSession: (entryId: string) => ipcRenderer.invoke(IPC.forkSession, entryId),
  compactSession: () => ipcRenderer.invoke(IPC.compactSession),
  sendPrompt: (text, behavior, autoNamingMode, images, promptId) => ipcRenderer.invoke(IPC.sendPrompt, text, behavior, autoNamingMode, images, promptId),
  abortAgent: () => ipcRenderer.invoke(IPC.abortAgent),
  setModel: (key: string, thinkingLevel: ThinkingLevel) => ipcRenderer.invoke(IPC.setModel, key, thinkingLevel),
  saveProviderKey: (providerId: string, apiKey: string, remember: boolean) =>
    ipcRenderer.invoke(IPC.saveProviderKey, providerId, apiKey, remember),
  refreshModels: () => ipcRenderer.invoke(IPC.refreshModels),
  loginProvider: (providerId: string) => ipcRenderer.invoke(IPC.loginProvider, providerId),
  answerAuthPrompt: (flowId: string, promptId: string, value?: string) =>
    ipcRenderer.invoke(IPC.answerAuthPrompt, flowId, promptId, value),
  cancelProviderLogin: (flowId: string) => ipcRenderer.invoke(IPC.cancelProviderLogin, flowId),
  disconnectProvider: (providerId: string) => ipcRenderer.invoke(IPC.disconnectProvider, providerId),
  getCustomModels: () => ipcRenderer.invoke(IPC.getCustomModels),
  saveCustomModel: (model: CustomModelConfig) => ipcRenderer.invoke(IPC.saveCustomModel, model),
  deleteCustomModel: (providerId: string, modelId: string) => ipcRenderer.invoke(IPC.deleteCustomModel, providerId, modelId),
  getResources: () => ipcRenderer.invoke(IPC.getResources),
  reloadResources: () => ipcRenderer.invoke(IPC.reloadResources),
  openResource: (path: string) => ipcRenderer.invoke(IPC.openResource, path),
  setResourceEnabled: (request) => ipcRenderer.invoke(IPC.setResourceEnabled, request),
  installResourcePackage: (source, scope) => ipcRenderer.invoke(IPC.installResourcePackage, source, scope),
  removeResourcePackage: (source, scope) => ipcRenderer.invoke(IPC.removeResourcePackage, source, scope),
  updateResourcePackage: (source) => ipcRenderer.invoke(IPC.updateResourcePackage, source),
  createResourceTemplate: (input) => ipcRenderer.invoke(IPC.createResourceTemplate, input),
  minimizeWindow: () => ipcRenderer.send(IPC.windowMinimize),
  toggleMaximizeWindow: () => ipcRenderer.send(IPC.windowToggleMaximize),
  closeWindow: () => ipcRenderer.send(IPC.windowClose),
  playCompletionSound: () => ipcRenderer.send(IPC.completionSound),
  onEvent: (listener: (event: DesktopEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: DesktopEvent) => listener(payload)
    ipcRenderer.on(IPC.event, handler)
    return () => ipcRenderer.removeListener(IPC.event, handler)
  },
}

contextBridge.exposeInMainWorld('piDesktop', bridge)
