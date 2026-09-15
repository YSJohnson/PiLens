const TITLE_PREFIX = /^(?:会话标题|任务标题|标题|session\s+title|title)\s*[:：-]\s*/iu
const MARKDOWN_PREFIX = /^(?:#{1,6}|[-*•])\s*/u
const QUOTE_WRAPPER = /^[`'“”‘’"]+|[`'“”‘’"]+$/gu
const CJK = /[\u3400-\u9fff]/u

function compactWhitespace(value: string): string {
  return value.replace(/\s+/gu, ' ').trim()
}

function truncateTitle(value: string): string {
  const characters = [...value]
  const limit = CJK.test(value) ? 28 : 60
  if (characters.length <= limit) return value

  const preview = characters.slice(0, limit + 1).join('')
  const boundary = Math.max(
    preview.lastIndexOf(' '),
    preview.lastIndexOf('，'),
    preview.lastIndexOf(','),
    preview.lastIndexOf('：'),
    preview.lastIndexOf(':'),
  )
  const clipped = boundary >= Math.floor(limit * 0.58) ? preview.slice(0, boundary) : characters.slice(0, limit).join('')
  return `${clipped.trim()}…`
}

export function provisionalSessionTitle(prompt: string): string {
  const firstUsefulLine = prompt
    .split(/\r?\n/u)
    .map((line) => line.replace(MARKDOWN_PREFIX, '').trim())
    .find((line) => line && !line.startsWith('```'))
  const compact = compactWhitespace(firstUsefulLine ?? prompt)
    .replace(/^(?:请帮我|我想要|我需要|麻烦|帮我|请)\s*/u, '')
    .replace(/[。！？!?；;]+$/u, '')
  return truncateTitle(compact || '新任务')
}

export function normalizeGeneratedSessionTitle(raw: string, fallback: string): string {
  const firstLine = raw.split(/\r?\n/u).map((line) => line.trim()).find(Boolean) ?? ''
  const normalized = compactWhitespace(firstLine)
    .replace(MARKDOWN_PREFIX, '')
    .replace(TITLE_PREFIX, '')
    .replace(QUOTE_WRAPPER, '')
    .replace(/[。.!！?？:：；;]+$/u, '')
    .trim()
  return normalized ? truncateTitle(normalized) : fallback
}
