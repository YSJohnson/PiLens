import { describe, expect, it } from 'vitest'
import { friendlyPromptError } from './prompt-error'

describe('friendlyPromptError', () => {
  it('turns common provider failures into actionable messages and preserves unknown errors', () => {
    expect(friendlyPromptError(new Error('401 Unauthorized'))).toContain('重新连接')
    expect(friendlyPromptError(new Error('429 rate_limit exceeded'))).toContain('切换模型')
    expect(friendlyPromptError(new Error('fetch failed: ECONNRESET'))).toContain('检查网络')
    expect(friendlyPromptError(new Error('vision input is unsupported'))).toContain('不支持图片')
    expect(friendlyPromptError(new Error('具体错误'))).toBe('具体错误')
  })
})
