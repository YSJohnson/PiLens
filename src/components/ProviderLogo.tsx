import { Cpu } from 'lucide-react'
import { useMemo, useState, type CSSProperties } from 'react'

interface ProviderLogoProps {
  providerId?: string
  providerName?: string
  size?: number
  className?: string
}

const localLogoModules = import.meta.glob<string>('../assets/provider-logos/*.svg', {
  eager: true,
  import: 'default',
  query: '?url',
})

const localLogos = new Map<string, string>()

for (const [path, url] of Object.entries(localLogoModules)) {
  const match = path.match(/provider-logos\/([^/]+)\.svg$/i)
  if (match?.[1]) localLogos.set(match[1].toLocaleLowerCase(), url)
}

const aliases = new Map<string, string>([
  ['chatgpt', 'openai'],
  ['codex', 'openai'],
  ['openai-codex', 'openai'],
  ['claude', 'anthropic'],
  ['claude-code', 'anthropic'],
  ['gemini', 'google'],
  ['google-gemini-cli', 'google'],
  ['github', 'github-copilot'],
  ['copilot', 'github-copilot'],
  ['opencode', 'gocode'],
  ['opencode-go', 'gocode'],
  ['opencode-zen', 'gocode'],
  ['zen', 'gocode'],
  ['zai', 'zai-coding-plan'],
  ['zhipu', 'zhipuai-coding-plan'],
  ['zhipuai', 'zhipuai-coding-plan'],
  ['minimax', 'minimax-coding-plan'],
  ['kimi', 'kimi-for-coding'],
  ['moonshot', 'kimi-for-coding'],
  ['evroc-ai', 'evroc'],
  ['ollama-cloud', 'ollama'],
  ['wafer', 'wafer.ai'],
  ['wafer-ai', 'wafer.ai'],
])

function normalizeProviderId(providerId?: string): string {
  return (providerId ?? '')
    .trim()
    .toLocaleLowerCase()
    .replace(/^models\./, '')
    .replace(/^provider\./, '')
    .replace(/\s+/g, '-')
}

function logoCandidates(providerId?: string): string[] {
  const normalized = normalizeProviderId(providerId)
  if (!normalized) return []
  const compact = normalized.replace(/[^a-z0-9_.\-/:]/g, '')
  const primary = compact.split(/[/:]/)[0] ?? compact
  const prefixAlias = compact.startsWith('exe-') ? 'exe-dev' : undefined
  return [...new Set([
    prefixAlias,
    aliases.get(compact),
    aliases.get(primary),
    compact,
    primary,
  ].filter((value): value is string => Boolean(value)))]
}

function sourcesFor(providerId?: string): string[] {
  const candidates = logoCandidates(providerId)
  const local = candidates.find((candidate) => localLogos.has(candidate))
  const remote = candidates[0]
  return [...new Set([
    local ? localLogos.get(local) : undefined,
    remote ? `https://models.dev/logos/${remote}.svg` : undefined,
  ].filter((value): value is string => Boolean(value)))]
}

export function ProviderLogo({ providerId, providerName, size = 20, className = '' }: ProviderLogoProps) {
  const sources = useMemo(() => sourcesFor(providerId), [providerId])
  const normalizedProviderId = normalizeProviderId(providerId)
  const [failedSource, setFailedSource] = useState({ providerId: normalizedProviderId, index: 0 })
  const sourceIndex = failedSource.providerId === normalizedProviderId ? failedSource.index : 0

  const source = sources[sourceIndex]
  const style = { '--provider-logo-size': `${size}px` } as CSSProperties

  return (
    <span
      className={`provider-logo ${className}`.trim()}
      data-provider={normalizeProviderId(providerId)}
      style={style}
      title={providerName || providerId || '模型 Provider'}
    >
      {source ? (
        <img
          src={source}
          alt=""
          draggable={false}
          decoding="async"
          onError={() => setFailedSource({ providerId: normalizedProviderId, index: sourceIndex + 1 })}
        />
      ) : (
        <Cpu aria-hidden="true" size={Math.max(12, size - 7)} strokeWidth={1.8} />
      )}
    </span>
  )
}
