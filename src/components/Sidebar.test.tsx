import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectInfo, SessionSummary } from '../shared/contracts'
import { useAppStore } from '../store/use-app-store'
import { Sidebar } from './Sidebar'

const initialState = useAppStore.getState()
const project: ProjectInfo = { name: '项目 A', path: 'C:\\a', isGit: false, dirtyCount: 0 }
const otherProject: ProjectInfo = { ...project, name: '项目 B', path: 'C:\\b' }
const sessions: SessionSummary[] = Array.from({ length: 7 }, (_, index) => ({
  id: `a-${index}`,
  path: `a-${index}.jsonl`,
  title: `会话 ${index}`,
  projectPath: project.path,
  createdAt: index,
  updatedAt: index,
  messageCount: 1,
}))

describe('Sidebar project history', () => {
  beforeEach(() => {
    useAppStore.setState({
      project,
      recentProjects: [otherProject],
      sessions: [...sessions, { ...sessions[0], id: 'b', title: '其他项目会话', projectPath: otherProject.path }],
      openProject: vi.fn().mockResolvedValue(undefined),
      openSession: vi.fn().mockResolvedValue(undefined),
    })
  })

  afterEach(() => {
    cleanup()
    useAppStore.setState(initialState, true)
  })

  it('shows the newest five and independently expands or collapses each directory', async () => {
    const user = userEvent.setup()
    render(<Sidebar onClose={() => undefined} onOpenSettings={() => undefined} />)
    const group = screen.getByRole('button', { name: '收起 项目 A 的会话' }).closest('section')!
    const history = within(group)
    const titles = () => history.getAllByRole('button').filter((button) => button.classList.contains('session-row')).map((button) => button.querySelector('.session-title')?.textContent)

    expect(titles()).toEqual(['会话 6', '会话 5', '会话 4', '会话 3', '会话 2'])
    expect(screen.queryByText('会话 0')).not.toBeInTheDocument()
    expect(screen.getByText('其他项目会话')).toBeVisible()
    await user.click(history.getByRole('button', { name: '展开其余 2 条会话' }))
    expect(titles()).toHaveLength(7)
    await user.click(history.getByRole('button', { name: '收起 项目 A 的会话' }))
    expect(screen.getByText('会话 6')).not.toBeVisible()
    expect(screen.getByText('其他项目会话')).toBeVisible()
    expect(useAppStore.getState().openProject).not.toHaveBeenCalled()
    await user.click(history.getByRole('button', { name: '展开 项目 A 的会话' }))
    expect(titles()).toHaveLength(7)
    await user.click(history.getByRole('button', { name: '收起更多会话' }))
    expect(titles()).toHaveLength(5)

    await user.click(screen.getByRole('button', { name: '打开工作目录 项目 B' }))
    expect(useAppStore.getState().openProject).toHaveBeenCalledWith(otherProject.path)
    await user.click(history.getByRole('button', { name: /^会话 6，/ }))
    expect(useAppStore.getState().openSession).toHaveBeenCalledWith(sessions[6].path, project.path)
  })

  it('keeps search and archived histories accessible and omits more for short or empty lists', async () => {
    useAppStore.setState({ sessions: sessions.map((session, index) => ({ ...session, archived: index === 0 })) })
    const user = userEvent.setup()
    render(<Sidebar onClose={() => undefined} onOpenSettings={() => undefined} />)
    expect(screen.getByText('尚无会话')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '搜索会话' }))
    await user.type(screen.getByPlaceholderText('搜索会话…'), '会话 1')
    expect(screen.getByText('会话 1')).toBeVisible()
    expect(screen.queryByRole('button', { name: /展开其余/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '清空搜索' }))
    await user.click(screen.getByRole('button', { name: '已归档 1' }))
    expect(screen.getByText('会话 0')).toBeVisible()
    expect(screen.queryByText('会话 6')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /展开其余/ })).not.toBeInTheDocument()
  })
})
