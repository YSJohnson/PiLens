import { FolderOpen, GitFork, LayoutPanelLeft, LoaderCircle, Maximize2, Minus, Monitor, PanelRight, Pencil, Square, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { desktop } from '../lib/desktop'
import { useAppStore } from '../store/use-app-store'

interface TitlebarProps {
  inspectorVisible: boolean
  onOpenBranches: () => void
  onOpenSettings: () => void
  onToggleInspector: () => void
  onToggleSidebar: () => void
}

export function Titlebar({ inspectorVisible, onOpenBranches, onOpenSettings, onToggleInspector, onToggleSidebar }: TitlebarProps) {
  const project = useAppStore((state) => state.project)
  const sessionName = useAppStore((state) => state.sessionName)
  const streaming = useAppStore((state) => state.streaming)
  const renameSession = useAppStore((state) => state.renameSession)
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  const beginRename = () => {
    setDraftName(sessionName || '新任务')
    setRenaming(true)
    window.setTimeout(() => renameInputRef.current?.select(), 0)
  }

  const finishRename = () => {
    setRenaming(false)
    const normalized = draftName.trim() || '新任务'
    if (normalized !== (sessionName || '新任务')) void renameSession(normalized)
  }

  return (
    <header className="titlebar">
      <div className="titlebar-drag-region">
        <button className="icon-button responsive-sidebar-toggle" type="button" onClick={onToggleSidebar} aria-label="切换任务栏">
          <LayoutPanelLeft size={17} />
        </button>
        <div className="breadcrumb">
          {renaming ? (
            <input
              ref={renameInputRef}
              className="breadcrumb-rename"
              value={draftName}
              aria-label="会话名称"
              onBlur={finishRename}
              onChange={(event) => setDraftName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
                if (event.key === 'Escape') setRenaming(false)
              }}
            />
          ) : (
            <button className="breadcrumb-task" type="button" onClick={beginRename} title="重命名会话">
              <span>{sessionName || '新任务'}</span><Pencil size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="titlebar-actions">
        {streaming ? <span className="titlebar-run-status" role="status"><LoaderCircle className="spin" size={14} /><span>运行中</span></span> : null}
        <button className="titlebar-text-button" type="button" aria-label="从历史消息继续" onClick={onOpenBranches}>
          <GitFork size={16} />
          <span>分支</span>
        </button>
        <button
          className="icon-button inspector-toggle"
          data-active={inspectorVisible || undefined}
          type="button"
          onClick={onToggleInspector}
          aria-label="切换检查器"
        >
          <PanelRight size={17} />
        </button>
        <button
          className="titlebar-text-button"
          type="button"
          aria-label="在资源管理器中打开当前项目"
          onClick={() => project && void desktop.openWorkspaceFile(project.path)}
        >
          <FolderOpen size={16} />
          <span>资源管理器</span>
        </button>
        <button className="titlebar-text-button local-runtime" type="button" aria-label="打开本地运行设置" onClick={onOpenSettings}>
          <Monitor size={15} />
          <span>本地</span>
        </button>
        <span className="window-divider" />
        <button className="window-button" type="button" onClick={() => desktop.minimizeWindow()} aria-label="最小化">
          <Minus size={16} />
        </button>
        <button className="window-button" type="button" onClick={() => desktop.toggleMaximizeWindow()} aria-label="最大化">
          {navigator.userAgent.includes('Windows') ? <Square size={12} /> : <Maximize2 size={14} />}
        </button>
        <button className="window-button window-close" type="button" onClick={() => desktop.closeWindow()} aria-label="关闭">
          <X size={16} />
        </button>
      </div>
    </header>
  )
}
