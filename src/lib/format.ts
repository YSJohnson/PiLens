const compactNumberFormatter = new Intl.NumberFormat('zh-CN', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

export function formatTokenCount(value: number): string {
  return compactNumberFormatter.format(value)
}

export function formatMoney(value: number): string {
  return value < 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`
}

export function formatFileSize(bytes?: number): string {
  if (bytes === undefined) return '大小未知'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`
}

export function formatDuration(milliseconds?: number): string {
  if (!milliseconds) return '不到 1 秒'
  const seconds = Math.round(milliseconds / 1000)
  if (seconds < 60) return `${seconds} 秒`
  const minutes = Math.floor(seconds / 60)
  const remaining = seconds % 60
  return `${minutes} 分 ${remaining} 秒`
}

export function formatResponseDuration(milliseconds: number): string {
  const clamped = Math.max(0, milliseconds)
  if (clamped < 60_000) return `${Math.max(0.1, clamped / 1000).toFixed(1)}s`

  const totalSeconds = Math.round(clamped / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours) return `${hours}h ${minutes}m`
  return `${minutes}m ${seconds}s`
}

export function formatMessageTimestamp(timestamp: number, now = Date.now()): string {
  const value = new Date(timestamp)
  const current = new Date(now)
  const time = new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(value)
  const sameDay = value.getFullYear() === current.getFullYear()
    && value.getMonth() === current.getMonth()
    && value.getDate() === current.getDate()
  if (sameDay) return time

  const date = value.getFullYear() === current.getFullYear()
    ? `${value.getMonth() + 1}月${value.getDate()}日`
    : `${value.getFullYear()}年${value.getMonth() + 1}月${value.getDate()}日`
  return `${date} ${time}`
}

export function formatRelativeTime(timestamp: number): string {
  const delta = Date.now() - timestamp
  const minutes = Math.max(0, Math.floor(delta / 60_000))
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} 天前`
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(timestamp)
}

export function basename(filePath: string): string {
  return filePath.split(/[\\/]/).at(-1) ?? filePath
}

export function dirname(filePath: string): string {
  const parts = filePath.split(/[\\/]/)
  return parts.slice(0, -1).join('/')
}
