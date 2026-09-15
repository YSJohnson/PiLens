import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppErrorBoundary } from './AppErrorBoundary'

function BrokenSurface(): never {
  throw new Error('Unable to load workspace surface')
}

describe('AppErrorBoundary', () => {
  afterEach(() => vi.restoreAllMocks())

  it('preserves a recoverable application surface after a renderer failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const reload = vi.fn()
    render(
      <AppErrorBoundary onReload={reload}>
        <BrokenSurface />
      </AppErrorBoundary>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('当前项目和 Pi 会话仍保存在本机')
    expect(screen.getByText('Unable to load workspace surface')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: '重新加载界面' }))
    expect(reload).toHaveBeenCalledOnce()
  })
})
