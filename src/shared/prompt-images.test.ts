import { describe, expect, it } from 'vitest'
import type { PromptImage } from './contracts'
import { MAX_PROMPT_IMAGE_BYTES, promptImageError } from './prompt-images'

const image = (data: string, mimeType = 'image/png'): PromptImage => ({ id: 'image', name: 'clipboard.png', mimeType, data })

describe('prompt images', () => {
  it('accepts supported clipboard images and rejects unsafe payloads', () => {
    expect(promptImageError([image('aGVsbG8=')])).toBeUndefined()
    expect(promptImageError([image('aGVsbG8=', 'image/svg+xml')])).toContain('PNG')
    expect(promptImageError([image('A'.repeat(Math.ceil((MAX_PROMPT_IMAGE_BYTES + 1) * 4 / 3)))])).toContain('10 MB')
    expect(promptImageError(Array.from({ length: 5 }, (_, index) => ({ ...image('aGVsbG8='), id: String(index) })))).toContain('4 张')
  })
})
