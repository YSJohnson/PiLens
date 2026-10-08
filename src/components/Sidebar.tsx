import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  FolderGit2,
  FolderPlus,
  GitBranch,
  LoaderCircle,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useEffect, useId, useMemo, useState } from 'react'
import { formatRelativeTime } from '../lib/format'
import { useAppStore } from '../store/use-app-store'
import { PiMark } from './PiMark'

interface SidebarProps {
  onClose: () => void
  onOpenSettings: () => void
}

function samePath(left: string, right: string): boolean {
  return left.replaceAll('\\', '/').toLocaleLowerCase() === right.replaceAll('\\', '/').toLocaleLowerCase()
}

export function Sidebar({ onClose, onOpenSettings }: SidebarProps) {
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const project = useAppStore((state) => state.project)
  const sessions = useAppStore((state) => state.sessions)
  const recentProjects = useAppStore((state) => state.recentProjects)
  const worktrees = useAppStore((state) => state.worktrees)
  const createSession = useAppStore((state) => state.createSession)
  const openSession = useAppStore((state) => state.openSession)
  const setSessionArchived = useAppStore((state) => state.setSessionArchived)
  const deleteSession = useAppStore((state) => state.deleteSession)
  const openProject = useAppStore((state) => state.openProject)
  const chooseProject = useAppStore((state) => state.chooseProject)
  const refreshWorkspace = useAppStore((state) => state.refreshWorkspace)
  const demoMode = useAppStore((state) => state.demoMode)
  const version = useAppStore((state) => state.version)
  const archivedCount = sessions.filter((session) => session.archived).length
  const showingArchived = showArchived && archivedCount > 0

  useEffect(() => {
    const focusSearch = () => {
      setSearchOpen(true)
      window.setTimeout(() => document.querySelector<HTMLInputElement>('.sidebar-search input')?.focus(), 0)
    }
    window.addEventListener('pi:focus-session-search', focusSearch)
    return () => window.removeEventListener('pi:focus-session-search', focusSearch)
  }, [])

  const projectGroups = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    const projects = [...(project ? [project] : []), ...recentProjects]
      .filter((item, index, all) => all.findIndex((candidate) => samePath(candidate.path, item.path)) === index)
    return projects.flatMap((item) => {
      const projectMatches = item.name.toLocaleLowerCase().includes(query) || item.path.toLocaleLowerCase().includes(query)
      const projectSessions = sessions
        .filter((session) => samePath(session.projectPath, item.path))
        .filter((session) => showingArchived ? session.archived : !session.archived)
        .filter((session) => !query || projectMatches || session.title.toLocaleLowerCase().includes(query))
        .toSorted((left, right) => right.updatedAt - left.updatedAt)
      return query && !projectMatches && !projectSessions.length ? [] : [{ project: item, sessions: projectSessions }]
    })
  }, [project, recentProjects, search, sessions, showingArchived])

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
        <button className="new-task-button" type="button" onClick={() => void createSession(project?.path)}>
          <Plus size={18} strokeWidth={1.8} />
          <span>新建会话</span>
        </button>

        <div className="sidebar-tool-row" aria-label="会话工具">
          <button type="button" onClick={() => void chooseProject()} aria-label="添加项目"><FolderPlus size={17} /></button>
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
        {projectGroups.map((group) => (
          <ProjectGroup
            key={group.project.path}
            project={group.project}
            sessions={group.sessions}
            active={Boolean(project && samePath(group.project.path, project.path))}
            onCreate={createSession}
            onOpenProject={openProject}
            onOpenSession={openSession}
            onSetArchived={setSessionArchived}
            onDelete={deleteSession}
          />
        ))}
        {!projectGroups.length ? (
          <p className="empty-list">没有匹配的任务</p>
        ) : null}
        {archivedCount ? (
          <button className="archived-toggle" type="button" data-active={showingArchived || undefined} onClick={() => setShowArchived((visible) => !visible)}>
            {showingArchived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
            {showingArchived ? '返回全部会话' : `已归档 ${archivedCount}`}
          </button>
        ) : null}
      </div>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button className="project-trigger" type="button">
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
            <DropdownMenu.Item className="dropdown-item" onSelect={() => void chooseProject()}><Plus size={15} /> 打开其他文件夹…</DropdownMenu.Item>
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

interface ProjectGroupProps {
  project: NonNullable<ReturnType<typeof useAppStore.getState>['project']>
  sessions: ReturnType<typeof useAppStore.getState>['sessions']
  active: boolean
  onCreate: (projectPath?: string) => Promise<void>
  onOpenProject: (path: string) => Promise<void>
  onOpenSession: (path: string, projectPath?: string) => Promise<void>
  onSetArchived: (path: string, projectPath: string, archived: boolean) => Promise<void>
  onDelete: (path: string, projectPath: string) => Promise<void>
}

function ProjectGroup({ project, sessions, active, onCreate, onOpenProject, onOpenSession, onSetArchived, onDelete }: ProjectGroupProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const sessionsId = useId()
  const running = sessions.filter((session) => session.streaming).length
  const visibleSessions = showAll ? sessions : sessions.slice(0, 5)
  return (
    <section className="project-group" data-active={active || undefined}>
      <div className="project-group-heading">
        <button
          type="button"
          className="project-group-open"
          aria-label={`${collapsed ? '展开' : '收起'} ${project.name} 的会话`}
          aria-expanded={!collapsed}
          aria-controls={sessionsId}
          onClick={() => setCollapsed((value) => !value)}
        >
          <ChevronDown size={15} data-collapsed={collapsed || undefined} />
          <span><strong>{project.name}</strong><small>{project.branch ?? project.path}</small></span>
          {running ? <i title={`${running} 个会话运行中`}><LoaderCircle className="spin" size={12} />{running}</i> : null}
        </button>
        <button type="button" className="project-group-new" onClick={() => { if (!active) void onOpenProject(project.path) }} aria-label={`打开工作目录 ${project.name}`} title="打开工作目录"><FolderGit2 size={14} /></button>
        <button type="button" className="project-group-new" onClick={() => void onCreate(project.path)} aria-label={`在 ${project.name} 新建会话`} title="新建会话"><Plus size={14} /></button>
      </div>
      <div id={sessionsId} hidden={collapsed}>
        {visibleSessions.map((session) => (
          <div className="session-row-shell" key={session.id}>
            <button
              type="button"
              className="session-row"
              data-active={session.active || undefined}
              data-streaming={session.streaming || undefined}
              aria-current={session.active ? 'true' : undefined}
              aria-label={`${session.title}，${session.streaming ? '运行中' : formatRelativeTime(session.updatedAt)}`}
              onClick={() => { if (!session.active) void onOpenSession(session.path, session.projectPath) }}
            >
              <MessageCircle size={15} strokeWidth={1.6} />
              <span className="session-title">{session.title}</span>
              <span className="session-meta">{session.streaming ? <span className="session-running-label"><LoaderCircle className="spin" size={12} />运行中</span> : formatRelativeTime(session.updatedAt)}</span>
            </button>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button className="session-more" type="button" aria-label={`${session.title} 的更多操作`} disabled={session.streaming}><MoreHorizontal size={15} /></button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content className="dropdown-content session-menu" sideOffset={4} align="end">
                  <DropdownMenu.Item className="dropdown-item" onSelect={() => void onSetArchived(session.path, session.projectPath, !session.archived)}>
                    {session.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                    {session.archived ? '恢复会话' : '归档会话'}
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    className="dropdown-item danger"
                    onSelect={() => {
                      if (window.confirm(`确定删除“${session.title}”吗？会话文件会移到 Windows 回收站。`)) void onDelete(session.path, session.projectPath)
                    }}
                  >
                    <Trash2 size={14} />删除会话
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        ))}
        {sessions.length > 5 ? (
          <button className="project-sessions-toggle" type="button" aria-expanded={showAll} aria-controls={sessionsId} onClick={() => setShowAll((value) => !value)}>
            <ChevronDown size={14} data-expanded={showAll || undefined} />
            {showAll ? '收起更多会话' : `展开其余 ${sessions.length - 5} 条会话`}
          </button>
        ) : null}
        {!sessions.length ? <p className="project-empty">尚无会话</p> : null}
      </div>
    </section>
  )
}
