import { describe, expect, it } from 'vitest'
import { normalizeGeneratedSessionTitle, provisionalSessionTitle } from './session-title'

describe('session title helpers', () => {
  it('creates a readable provisional title from the first useful line', () => {
    expect(provisionalSessionTitle('\n请帮我 优化用户数据同步性能。\n更多约束')).toBe('优化用户数据同步性能')
  })

  it('normalizes a model title without markdown wrappers', () => {
    expect(normalizeGeneratedSessionTitle('## 会话标题： “修复 OAuth 登录恢复。”\n说明', '回退标题')).toBe('修复 OAuth 登录恢复')
  })

  it('keeps the fallback when the model returned no title', () => {
    expect(normalizeGeneratedSessionTitle('  \n', '回退标题')).toBe('回退标题')
  })
})
