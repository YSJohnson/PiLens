import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DesktopEvent } from '../shared/contracts'
import { createDemoBridge } from './demo-bridge'

describe('browser preview bridge', () => {
  afterEach(() => vi.useRealTimers())

  it('returns isolated bootstrap snapshots', async () => {
    const bridge = createDemoBridge()
    const first = await bridge.bootstrap()
    const second = await bridge.bootstrap()

    first.snapshot!.messages[0].content = 'mutated locally'
    expect(second.demoMode).toBe(true)
    expect(second.snapshot?.messages[0].content).not.toBe('mutated locally')
  })

  it('streams a complete assistant reply and returns to idle', async () => {
    vi.useFakeTimers()
    const bridge = createDemoBridge()
    const events: DesktopEvent[] = []
    const unsubscribe = bridge.onEvent((event) => events.push(event))

    await bridge.sendPrompt('补齐并发边界测试')
    await vi.advanceTimersByTimeAsync(4_000)

    expect(events[0]).toEqual({ type: 'agent:status', streaming: true })
    expect(events.some((event) => event.type === 'message:delta')).toBe(true)
    const completed = events.find((event) => event.type === 'message:end')
    expect(completed).toMatchObject({
      type: 'message:end',
      message: { provider: 'anthropic', thinkingLevel: 'high' },
    })
    expect(completed?.type === 'message:end' ? completed.message.durationMs : 0).toBeGreaterThan(0)
    expect(events.at(-1)).toEqual({ type: 'agent:status', streaming: false })
    unsubscribe()
  })

  it('reports compaction progress and returns the reduced context snapshot', async () => {
    const bridge = createDemoBridge()
    const before = (await bridge.bootstrap()).snapshot!
    const events: DesktopEvent[] = []
    const unsubscribe = bridge.onEvent((event) => events.push(event))

    const after = await bridge.compactSession()

    const compactionEvents = events.filter((event) => event.type === 'compaction:status')
    expect(compactionEvents).toHaveLength(2)
    expect(compactionEvents[0]).toMatchObject({ type: 'compaction:status', compaction: { active: true, reason: 'manual' } })
    expect(compactionEvents[1]).toMatchObject({ type: 'compaction:status', compaction: { active: false, count: before.compaction.count + 1 } })
    expect(after.stats.contextTokens).toBeLessThan(before.stats.contextTokens!)
    unsubscribe()
  })
})
