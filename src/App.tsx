import * as Tooltip from '@radix-ui/react-tooltip'
import { LoaderCircle, Minus, Square, X } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { ActivityRail } from './components/ActivityRail'
import { ChatTimeline } from './components/ChatTimeline'
import { Composer } from './components/Composer'
import { Inspector, type InspectorTab } from './components/Inspector'
import type { SettingsSection } from './components/SettingsDialog'
import { Sidebar } from './components/Sidebar'
import { Titlebar } from './components/Titlebar'
import { ToastViewport } from './components/ToastViewport'
import { WelcomeScreen } from './components/WelcomeScreen'
import { PiMark } from './components/PiMark'
import { desktop } from './lib/desktop'
import { useAppStore } from './store/use-app-store'
import { useUiPreferences } from './store/use-ui-preferences'

const SettingsDialog = lazy(() => import('./components/SettingsDialog').then((module) => ({ default: module.SettingsDialog })))
const SessionBranchDialog = lazy(() => import('./components/SessionBranchDialog').then((module) => ({ default: module.SessionBranchDialog })))
const FilePreviewDialog = lazy(() => import('./components/FilePreviewDialog').then((module) => ({ default: module.FilePreviewDialog })))
const ProviderAuthDialog = lazy(() => import('./components/ProviderAuthDialog').then((module) => ({ default: module.ProviderAuthDialog })))

function LazySurfaceFallback() {
  return (
    <div className="lazy-surface-fallback" role="status" aria-live="polite">
      <LoaderCircle className="spin" size={17} />
      <span>正在打开…</span>
    </div>
  )
}

export default function App() {
  const ready = useAppStore((state) => state.ready)
  const project = useAppStore((state) => state.project)
  const initialize = useAppStore((state) => state.initialize)
  const streaming = useAppStore((state) => state.streaming)
  const hasFilePreview = useAppStore((state) => Boolean(state.filePreview))
  const hasAuthFlow = useAppStore((state) => Boolean(state.authFlow))
  const completionSound = useUiPreferences((state) => state.completionSound)
  const themePreference = useUiPreferences((state) => state.themePreference)
  const wasStreaming = useRef(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sessionBranchOpen, setSessionBranchOpen] = useState(false)
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('general')
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('context')
  const [inspectorVisible, setInspectorVisible] = useState(true)
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [focusMode, setFocusMode] = useState(false)

  const toggleSidebar = () => {
    if (focusMode) {
      setFocusMode(false)
      setSidebarVisible(true)
      return
    }
    setSidebarVisible((visible) => {
      const next = !visible
      if (next && window.innerWidth <= 900) setInspectorVisible(false)
      return next
    })
  }

  const toggleInspector = () => {
    if (focusMode) {
      setFocusMode(false)
      setInspectorVisible(true)
      return
    }
    setInspectorVisible((visible) => {
      const next = !visible
      if (next && window.innerWidth <= 900) setSidebarVisible(false)
      return next
    })
  }

  const selectInspectorTab = (tab: InspectorTab) => {
    if (inspectorVisible && tab === inspectorTab) {
      setInspectorVisible(false)
      return
    }
    setInspectorTab(tab)
    setInspectorVisible(true)
    if (window.innerWidth <= 900) setSidebarVisible(false)
  }

  useEffect(() => {
    let disposed = false
    let dispose: (() => void) | undefined
    void initialize().then((cleanup) => {
      if (disposed) cleanup()
      else dispose = cleanup
    })
    return () => {
      disposed = true
      dispose?.()
    }
  }, [initialize])

  useEffect(() => {
    const systemTheme = window.matchMedia('(prefers-color-scheme: light)')
    const applyTheme = () => {
      document.documentElement.dataset.theme = themePreference === 'system'
        ? systemTheme.matches ? 'light' : 'dark'
        : themePreference
    }
    applyTheme()
    if (themePreference === 'system') systemTheme.addEventListener('change', applyTheme)
    return () => systemTheme.removeEventListener('change', applyTheme)
  }, [themePreference])

  useEffect(() => {
    if (streaming) {
      wasStreaming.current = true
      return
    }
    if (wasStreaming.current && completionSound) desktop.playCompletionSound()
    wasStreaming.current = false
  }, [completionSound, streaming])

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        void useAppStore.getState().createSession()
      }
      if (event.ctrlKey && event.key === ',') {
        event.preventDefault()
        setSettingsSection('general')
        setSettingsOpen(true)
      }
      if (event.ctrlKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setFocusMode(false)
        setSidebarVisible(true)
        window.dispatchEvent(new CustomEvent('pi:focus-session-search'))
      }
      if (event.key === 'Escape' && focusMode) {
        setFocusMode(false)
      }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [focusMode])

  useEffect(() => {
    const closeCrowdedPanels = () => {
      if (window.innerWidth <= 1320) setInspectorVisible(false)
      if (window.innerWidth <= 900) setSidebarVisible(false)
    }
    closeCrowdedPanels()
    window.addEventListener('resize', closeCrowdedPanels)
    return () => window.removeEventListener('resize', closeCrowdedPanels)
  }, [])

  if (!ready) {
    return (
      <div className="splash-screen">
        <div className="brand-mark"><PiMark size={34} /></div>
        <LoaderCircle className="spin" size={18} />
        <span>正在启动 PiLens</span>
      </div>
    )
  }

  return (
    <Tooltip.Provider>
      {project ? (
        <div
          className="app-shell"
          data-focus-mode={focusMode || undefined}
          data-inspector={inspectorVisible && !focusMode || undefined}
          data-sidebar={sidebarVisible || undefined}
        >
          <div className="sidebar-slot" data-visible={sidebarVisible || undefined}>
            <Sidebar onClose={() => setSidebarVisible(false)} onOpenSettings={() => { setSettingsSection('general'); setSettingsOpen(true) }} />
          </div>
          <main className="workspace" data-inspector={inspectorVisible && !focusMode || undefined}>
            <Titlebar
              inspectorVisible={inspectorVisible && !focusMode}
              onOpenBranches={() => setSessionBranchOpen(true)}
              onOpenSettings={() => { setSettingsSection('general'); setSettingsOpen(true) }}
              onToggleInspector={toggleInspector}
              onToggleSidebar={toggleSidebar}
            />
            <ChatTimeline />
            <Composer focusMode={focusMode} onToggleFocus={() => setFocusMode((value) => !value)} onOpenSettings={() => { setSettingsSection('providers'); setSettingsOpen(true) }} />
            <div className="inspector-slot" data-visible={inspectorVisible || undefined}>
              <Inspector
                activeTab={inspectorTab}
                onClose={() => setInspectorVisible(false)}
                onOpenProviderSettings={() => { setSettingsSection('providers'); setSettingsOpen(true) }}
                onTabChange={setInspectorTab}
              />
            </div>
          </main>
          <ActivityRail
            activeTab={inspectorTab}
            inspectorVisible={inspectorVisible}
            onOpenSettings={() => { setSettingsSection('general'); setSettingsOpen(true) }}
            onSelectTab={selectInspectorTab}
          />
        </div>
      ) : (
        <div className="welcome-shell">
          <div className="welcome-titlebar">
            <span>PiLens</span>
            <div>
              <button type="button" aria-label="最小化" onClick={() => window.piDesktop?.minimizeWindow()}><Minus size={16} /></button>
              <button type="button" aria-label="最大化" onClick={() => window.piDesktop?.toggleMaximizeWindow()}><Square size={12} /></button>
              <button type="button" aria-label="关闭" onClick={() => window.piDesktop?.closeWindow()}><X size={16} /></button>
            </div>
          </div>
          <WelcomeScreen />
        </div>
      )}
      <Suspense fallback={<LazySurfaceFallback />}>
        {settingsOpen ? (
          <SettingsDialog
            open
            section={settingsSection}
            onOpenChange={setSettingsOpen}
            onSectionChange={setSettingsSection}
          />
        ) : null}
        {sessionBranchOpen ? <SessionBranchDialog open onOpenChange={setSessionBranchOpen} /> : null}
        {hasFilePreview ? <FilePreviewDialog /> : null}
        {hasAuthFlow ? <ProviderAuthDialog /> : null}
      </Suspense>
      <ToastViewport />
    </Tooltip.Provider>
  )
}
