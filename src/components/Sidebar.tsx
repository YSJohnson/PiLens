import {
  ChevronDown,
  FolderGit2,
  FolderPlus,
  GitBranch,
  LoaderCircle,
  Menu,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useEffect, useMemo, useState } from 'react'
import { formatRelativeTime } from '../lib/format'
import { useAppStore } from '../store/use-app-store'
import { PiMark } from './PiMark'

interface SidebarProps {
  onClose: () => void
  onOpenSettings: () => void
}

function isToday(timestamp: number): boolean {
  const date = new Date(timestamp)
  const today = new Date()
  return date.toDateString() === today.toDateString()
}

export function Sidebar({ onClose, onOpenSettings }: SidebarProps) {
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const project = useAppStore((state) => state.project)
  const sessions = useAppStore((state) => state.sessions)
  const recentProjects = useAppStore((state) => state.recentProjects)
  const worktrees = useAppStore((state) => state.worktrees)
  const streaming = useAppStore((state) => state.streaming)
  const createSession = useAppStore((state) => state.createSession)
  const openSession = useAppStore((state) => state.openSession)
  const openProject = useAppStore((state) => state.openProject)
  const chooseProject = useAppStore((state) => state.chooseProject)
  const refreshWorkspace = useAppStore((state) => state.refreshWorkspace)
  const demoMode = useAppStore((state) => state.demoMode)
  const version = useAppStore((state) => state.version)

  useEffect(() => {
    const focusSearch = () => {
      setSearchOpen(true)
      window.setTimeout(() => document.querySelector<HTMLInputElement>('.sidebar-search input')?.focus(), 0)
    }
    window.addEventListener('pi:focus-session-search', focusSearch)
    return () => window.removeEventListener('pi:focus-session-search', focusSearch)
  }, [])

  const groupedSessions = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    const visible = sessions.filter((session) => session.title.toLocaleLowerCase().includes(query))
    return {
      today: visible.filter((session) => isToday(session.updatedAt)),
      earlier: visible.filter((session) => !isToday(session.updatedAt)),
    }
  }, [search, sessions])

  return (
    <aside className="task-sidebar">
      <div className="sidebar-brand">
        <button className="sidebar-top-button" type="button" onClick={onClose} aria-label="收起侧栏"><Menu size={19} /></button>
        <span className="sidebar-wordmark"><PiMark size={24} /><span>PiLens</span></span>
        {demoMode ? <span className="demo-label">PREVIEW</span> : null}
        <button className="drawer-close" type="button" onClick={onClose} aria-label="关闭侧栏">
          <X size={16} />
        </button>
      </div>

      <div className="sidebar-controls">
        <button className="new-task-button" type="button" disabled={streaming} title={streaming ? 'Pi 完成当前回复后可新建会话' : undefined} onClick={() => void createSession()}>
          <Plus size={18} strokeWidth={1.8} />
          <span>新建会话</span>
        </button>

        <div className="sidebar-tool-row" aria-label="会话工具">
          <button type="button" disabled={streaming} title={streaming ? 'Pi 完成当前回复后可切换项目' : undefined} onClick={() => void chooseProject()} aria-label="添加项目"><FolderPlus size={17} /></button>
          <button type="button" onClick={() => setSearchOpen((open) => !open)} aria-label="搜索会话" data-active={searchOpen || undefined}><Search size={17} /></button>
          <button type="button" onClick={() => project && void refreshWorkspace()} aria-label="刷新项目" title="刷新项目"><RefreshCw size={17} /></button>
          <span />
          <button type="button" onClick={onOpenSettings} aria-label="会话显示设置"><SlidersHorizontal size={17} /></button>
        </div>

        {searchOpen ? (
          <label className="sidebar-search">
            <Search size={15} strokeWidth={1.7} />
            <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索会话…" />
            {search ? <button type="button" onClick={() => setSearch('')} aria-label="清空搜索"><X size={14} /></button> : null}
          </label>
        ) : null}

      </div>

      <div className="session-list" aria-label="任务历史">
        {groupedSessions.today.length ? (
          <SessionGroup label="聊天" sessions={groupedSessions.today} appStreaming={streaming} onOpen={openSession} />
        ) : null}
        {groupedSessions.earlier.length ? (
          <SessionGroup label="最近" sessions={groupedSessions.earlier} appStreaming={streaming} onOpen={openSession} />
        ) : null}
        {!groupedSessions.today.length && !groupedSessions.earlier.length ? (
          <p className="empty-list">没有匹配的任务</p>
        ) : null}
      </div>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button className="project-trigger" type="button" disabled={streaming} title={streaming ? 'Pi 完成当前回复后可切换 worktree' : undefined}>
            <FolderGit2 size={16} strokeWidth={1.7} />
            <span><strong>{project?.name ?? '选择项目'}</strong><small>{project?.branch ?? project?.path}</small></span>
            <ChevronDown size={14} />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="dropdown-content project-menu" sideOffset={6} align="start">
            {worktrees.length ? (
              <>
                <DropdownMenu.Label className="dropdown-label">Git worktree</DropdownMenu.Label>
                {worktrees.map((item) => (
                  <DropdownMenu.Item
                    key={item.path}
                    className="dropdown-item project-menu-item"
                    data-current={item.current || undefined}
                    disabled={streaming && !item.current}
                    onSelect={() => { if (!item.current) void openProject(item.path) }}
                  >
                    <GitBranch size={15} />
                    <span><strong>{item.branch ?? (item.bare ? 'bare' : 'detached HEAD')}</strong><small>{item.path}</small></span>
                    {item.current ? <i>当前</i> : null}
                  </DropdownMenu.Item>
                ))}
                <DropdownMenu.Separator className="dropdown-separator" />
              </>
            ) : null}
            <DropdownMenu.Label className="dropdown-label">最近的项目</DropdownMenu.Label>
            {recentProjects.map((item) => (
              <DropdownMenu.Item key={item.path} className="dropdown-item project-menu-item" disabled={streaming} onSelect={() => void openProject(item.path)}>
                <FolderGit2 size={15} />
                <span><strong>{item.name}</strong><small>{item.path}</small></span>
              </DropdownMenu.Item>
            ))}
            <DropdownMenu.Separator className="dropdown-separator" />
            <DropdownMenu.Item className="dropdown-item" disabled={streaming} onSelect={() => void chooseProject()}><Plus size={15} /> 打开其他文件夹…</DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <footer className="sidebar-footer">
        <button className="sidebar-settings" type="button" onClick={onOpenSettings}><Settings2 size={17} />设置</button>
        <span className="sidebar-version">v{version}</span>
      </footer>
    </aside>
  )
}

interface SessionGroupProps {
  label: string
  sessions: ReturnType<typeof useAppStore.getState>['sessions']
  appStreaming: boolean
  onOpen: (path: string) => Promise<void>
}

function SessionGroup({ label, sessions, appStreaming, onOpen }: SessionGroupProps) {
  return (
    <section className="session-group">
      <h2>{label}</h2>
      <div>
        {sessions.map((session) => {
          const switchBlocked = appStreaming && !session.active
          return (
            <button
              type="button"
              key={session.id}
              className="session-row"
              data-active={session.active || undefined}
              data-streaming={session.streaming || undefined}
              aria-current={session.active ? 'true' : undefined}
              aria-label={`${session.title}，${session.streaming ? '运行中' : formatRelativeTime(session.updatedAt)}`}
              disabled={switchBlocked}
              title={switchBlocked ? 'Pi 完成当前回复后可切换会话' : undefined}
              onClick={() => { if (!session.active) void onOpen(session.path) }}
            >
              <MessageCircle size={15} strokeWidth={1.6} />
              <span className="session-title">{session.title}</span>
              <span className="session-meta">{session.streaming ? <span className="session-running-label"><LoaderCircle className="spin" size={12} />运行中</span> : formatRelativeTime(session.updatedAt)}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
