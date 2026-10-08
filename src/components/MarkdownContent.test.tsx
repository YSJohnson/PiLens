import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import MarkdownContent from './MarkdownContent'

afterEach(cleanup)

it('renders GFM tables in a keyboard-accessible scroll region with room for every column', () => {
  const token = 'abcdef0123456789'.repeat(16)
  render(<MarkdownContent content={`| 字段 | 值 | 来源 |\n| :--- | :---: | ---: |\n| userid | \`${token}\` | 请求参数 |`} />)
  const region = screen.getByRole('region', { name: '表格（可横向滚动）' })
  expect(region).toHaveAttribute('tabindex', '0')
  expect(within(region).getByRole('table').style.minWidth).toBe('24rem')
  expect(within(region).getAllByRole('columnheader')).toHaveLength(3)
  expect(screen.getByText(token)).toBeVisible()
  expect(screen.getByRole('columnheader', { name: '来源' }).style.textAlign).toBe('right')
})
