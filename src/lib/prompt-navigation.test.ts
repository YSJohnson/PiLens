import { describe, expect, it } from 'vitest'
import { findActivePromptId, samplePromptIndexes } from './prompt-navigation'

describe('prompt navigation', () => {
  it('finds the current prompt from cached offsets and anchors the last prompt at the bottom', () => {
    const prompts = [
      { id: 'first', top: 80 },
      { id: 'middle', top: 640 },
      { id: 'last', top: 1_320 },
    ]

    expect(findActivePromptId(prompts, 0, 600, 2_000)).toBe('first')
    expect(findActivePromptId(prompts, 650, 600, 2_000)).toBe('middle')
    expect(findActivePromptId(prompts, 1_400, 600, 2_000)).toBe('last')
  })

  it('caps long rails while keeping their first and last prompts', () => {
    const indexes = samplePromptIndexes(100)
    expect(indexes).toHaveLength(30)
    expect(indexes[0]).toBe(0)
    expect(indexes.at(-1)).toBe(99)
    expect(new Set(indexes).size).toBe(indexes.length)
  })
})
