import { afterEach, describe, expect, it, vi } from 'vitest'
import { basename, dirname, formatDuration, formatMessageTimestamp, formatMoney, formatRelativeTime, formatResponseDuration } from './format'

describe('format helpers', () => {
  afterEach(() => vi.useRealTimers())

  it('formats durations and low costs for the task ledger', () => {
    expect(formatDuration()).toBe('不到 1 秒')
    expect(formatDuration(92_000)).toBe('1 分 32 秒')
    expect(formatResponseDuration(45_100)).toBe('45.1s')
    expect(formatResponseDuration(92_000)).toBe('1m 32s')
    expect(formatResponseDuration(0)).toBe('0.1s')
    expect(formatMessageTimestamp(
      new Date('2026-09-04T11:54:00+08:00').getTime(),
      new Date('2026-09-06T12:00:00+08:00').getTime(),
    )).toBe('9月4日 11:54')
    expect(formatMoney(0.0042)).toBe('$0.0042')
    expect(formatMoney(1.275)).toBe('$1.27')
  })

  it('handles Windows and POSIX workspace paths', () => {
    expect(basename('src\\services\\SyncService.ts')).toBe('SyncService.ts')
    expect(dirname('src\\services\\SyncService.ts')).toBe('src/services')
    expect(basename('src/app.ts')).toBe('app.ts')
  })

  it('uses stable relative-time boundaries', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-04T12:00:00+08:00'))
    expect(formatRelativeTime(Date.now() - 30_000)).toBe('刚刚')
    expect(formatRelativeTime(Date.now() - 90 * 60_000)).toBe('1 小时前')
    expect(formatRelativeTime(Date.now() - 3 * 86_400_000)).toBe('3 天前')
  })
})
