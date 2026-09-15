import { afterEach, describe, expect, it, vi } from 'vitest'
import { reduceDeltaBatch, reduceDesktopEvent, useAppStore } from './use-app-store'

describe('desktop event session status', () => {
  afterEach(() => vi.restoreAllMocks())

  it('keeps the active sidebar session synchronized with the live agent state', () => {
    vi.spyOn(Date, 'now').mockReturnValue(123_456)
    const state = {
      ...useAppStore.getState(),
      sessions: [
        { id: 'active', path: 'active.jsonl', title: 'Active', projectPath: 'C:\\project', createdAt: 1, updatedAt: 2, messageCount: 2, active: true },
        { id: 'other', path: 'other.jsonl', title: 'Other', projectPath: 'C:\\project', createdAt: 1, updatedAt: 3, messageCount: 2 },
      ],
    }

    const started = reduceDesktopEvent(state, { type: 'agent:status', streaming: true })
    expect(started.streaming).toBe(true)
    expect(started.sessions?.[0]).toEqual(expect.objectContaining({ id: 'active', streaming: true, updatedAt: 123_456 }))
    expect(started.sessions?.[1]).toEqual(state.sessions[1])

    const stopped = reduceDesktopEvent({ ...state, sessions: started.sessions! }, { type: 'agent:status', streaming: false })
    expect(stopped.sessions?.[0]).toEqual(expect.objectContaining({ id: 'active', streaming: false }))
  })

  it('coalesces streamed deltas and keeps only the newest tool output', () => {
    const tool = { id: 'tool-1', name: 'bash', label: 'Bash', status: 'running' as const, args: {}, output: '' }
    const streaming = { id: 'a1', role: 'assistant' as const, content: 'Hello', timestamp: 1, status: 'streaming' as const, toolRuns: [{ ...tool }] }
    const history = { id: 'u1', role: 'user' as const, content: 'Hi', timestamp: 0 }
    const state = { ...useAppStore.getState(), messages: [history, streaming] }

    const patch = reduceDeltaBatch(state, [
      { type: 'message:delta', messageId: 'a1', delta: ' world', channel: 'text' },
      { type: 'message:delta', messageId: 'a1', delta: '!', channel: 'text' },
      { type: 'message:delta', messageId: 'a1', delta: 'thinking…', channel: 'thinking' },
      { type: 'tool:update', messageId: 'a1', toolId: 'tool-1', output: 'partial' },
      { type: 'tool:update', messageId: 'a1', toolId: 'tool-1', output: 'partial and more' },
    ])

    expect(patch.messages?.[1]).toEqual(
      expect.objectContaining({ content: 'Hello world!', thinking: 'thinking…', toolRuns: [expect.objectContaining({ output: 'partial and more' })] }),
    )
    expect(patch.messages?.[0]).toBe(history)
  })
})
