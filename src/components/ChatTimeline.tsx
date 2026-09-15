import { lazy, memo, Suspense, useEffect, useRef, useState } from 'react'
import {
  ArrowDown,
  BrainCircuit,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  Code2,
  Copy,
  FileCode2,
  Hourglass,
  LoaderCircle,
  RotateCcw,
  TerminalSquare,
  Wrench,
} from 'lucide-react'
import { formatDuration, formatMessageTimestamp, formatResponseDuration } from '../lib/format'
import { desktop } from '../lib/desktop'
import type { ToolRun, UiMessage } from '../shared/contracts'
import { useAppStore } from '../store/use-app-store'
import { useUiPreferences } from '../store/use-ui-preferences'
import { PiMark } from './PiMark'
import { ProviderLogo } from './ProviderLogo'

const MarkdownContent = lazy(() => import('./MarkdownContent'))
const MAX_RENDERED_TOOL_OUTPUT = 60_000
const MESSAGE_TIME_FORMATTER = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' })

function commandFromTool(tool: ToolRun): string {
  const values = Object.values(tool.args)
  const preferred = tool.args.command ?? tool.args.path ?? tool.args.file_path
  if (typeof preferred === 'string') return preferred
  const primitive = values.find((value) => typeof value === 'string')
  return typeof primitive === 'string' ? primitive : tool.name
}

function statusLabel(tool: ToolRun): string {
  if (tool.status === 'running') return '运行中'
  if (tool.status === 'error') return '失败'
  if (tool.status === 'success') return '已完成'
  return '等待中'
}

function filePathFromTool(tool: ToolRun, projectPath?: string): string | undefined {
  const candidate = tool.args.path ?? tool.args.file_path
  if (typeof candidate !== 'string' || !candidate.trim()) return undefined
  const normalized = candidate.replaceAll('\\', '/').trim()
  const root = projectPath?.replaceAll('\\', '/').replace(/\/$/, '')
  if (root && normalized.toLocaleLowerCase().startsWith(`${root.toLocaleLowerCase()}/`)) {
    return normalized.slice(root.length + 1)
  }
  if (/^[a-z]:\//i.test(normalized) || normalized.startsWith('/') || normalized.startsWith('../')) return undefined
  return normalized
}

function renderableToolOutput(output: string): { text: string; truncated: boolean } {
  if (output.length <= MAX_RENDERED_TOOL_OUTPUT) return { text: output, truncated: false }
  const head = output.slice(0, 44_000)
  const tail = output.slice(-14_000)
  return {
    text: `${head}\n\n… 已省略 ${output.length - 58_000} 个字符 …\n\n${tail}`,
    truncated: true,
  }
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.append(textarea)
  textarea.select()
  document.execCommand('copy')
  textarea.remove()
}

const ToolLedger = memo(function ToolLedger({ tool }: { tool: ToolRun }) {
  const defaultExpanded = useUiPreferences((state) => state.toolOutputDefaultExpanded)
  const [manualState, setManualState] = useState<{ preference: boolean; open: boolean }>()
  const [copied, setCopied] = useState(false)
  const projectPath = useAppStore((state) => state.project?.path)
  const open = manualState?.preference === defaultExpanded ? manualState.open : defaultExpanded
  const Icon = tool.name === 'bash' || tool.name === 'powershell' ? TerminalSquare : Code2
  const filePath = filePathFromTool(tool, projectPath)
  const renderedOutput = renderableToolOutput(tool.output || '等待工具返回结果…')

  const copyOutput = async () => {
    await copyText(tool.output)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <section className="tool-ledger" data-status={tool.status}>
      <button className="tool-ledger-header" type="button" onClick={() => setManualState({ preference: defaultExpanded, open: !open })} aria-expanded={open}>
        <Icon className="tool-icon-wrap" size={15} strokeWidth={1.7} />
        <span className="tool-heading">
          <strong>{tool.label}</strong>
          <code>{commandFromTool(tool)}</code>
        </span>
        {tool.durationMs ? <span className="tool-duration">{formatDuration(tool.durationMs)}</span> : null}
        <span className="tool-status" title={statusLabel(tool)}>
          {tool.status === 'running' ? <LoaderCircle className="spin" size={14} /> : null}
          {tool.status === 'success' ? <Check size={14} /> : null}
          {tool.status === 'error' ? <CircleAlert size={14} /> : null}
        </span>
        <ChevronDown className="tool-chevron" data-open={open || undefined} size={15} />
      </button>
      {open ? (
        <div className="tool-output-wrap">
          <div className="tool-output-actions">
            {filePath ? <button type="button" onClick={() => void desktop.openWorkspaceFile(filePath)}><FileCode2 size={13} />打开文件</button> : null}
            {tool.output ? <button type="button" onClick={() => void copyOutput()}>{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? '已复制' : '复制输出'}</button> : null}
          </div>
          <pre>{renderedOutput.text}</pre>
          {renderedOutput.truncated ? <small className="tool-output-truncated">界面已折叠超长输出；复制仍会保留完整内容。</small> : null}
        </div>
      ) : null}
    </section>
  )
})

const ThinkingDisclosure = memo(function ThinkingDisclosure({ content, streaming }: { content: string; streaming: boolean }) {
  const defaultExpanded = useUiPreferences((state) => state.thinkingDefaultExpanded)
  const [manualState, setManualState] = useState<{ preference: boolean; open: boolean }>()
  const open = manualState?.preference === defaultExpanded ? manualState.open : defaultExpanded

  return (
    <section className="thinking-disclosure" data-open={open || undefined}>
      <button type="button" aria-expanded={open} onClick={() => setManualState({ preference: defaultExpanded, open: !open })}>
        <BrainCircuit size={15} />
        <strong>{streaming ? '正在思考' : '思考过程'}</strong>
        <span>{streaming ? '实时生成' : open ? '已展开' : '已折叠'}</span>
        <ChevronDown size={15} />
      </button>
      {open ? <p>{content}</p> : null}
    </section>
  )
})

const MessageDuration = memo(function MessageDuration({ message }: { message: UiMessage }) {
  const streaming = message.status === 'streaming'
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!streaming) return
    const timer = window.setInterval(() => setNow(Date.now()), 100)
    return () => window.clearInterval(timer)
  }, [streaming])

  const duration = message.durationMs ?? (streaming ? Math.max(0, now - message.timestamp) : undefined)
  if (duration === undefined) return null

  return (
    <span className="message-meta-item message-duration" title={`本次回复用时 ${formatResponseDuration(duration)}`}>
      <Hourglass size={13} />
      <span>{formatResponseDuration(duration)}</span>
    </span>
  )
})

const ConversationMessage = memo(function ConversationMessage({ message }: { message: UiMessage }) {
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)
  const [longMessageOpen, setLongMessageOpen] = useState(false)
  const models = useAppStore((state) => state.models)
  const selectedModelKey = useAppStore((state) => state.modelKey)
  const collapseLongUserMessages = useUiPreferences((state) => state.collapseLongUserMessages)
  const recordedModel = models.find((item) => item.id === message.model && (!message.provider || item.provider === message.provider))
  const selectedModel = models.find((item) => item.key === selectedModelKey)
  const model = recordedModel ?? (message.model ? undefined : selectedModel)
  const displayedModelName = model?.name ?? message.model ?? selectedModel?.name ?? 'Pi'
  const displayedProviderId = message.provider ?? model?.provider ?? selectedModel?.provider
  const displayedProviderName = model?.providerName ?? selectedModel?.providerName
  const isLongUserMessage = isUser && (message.content.length > 720 || message.content.split('\n').length > 10)
  const messageCollapsed = collapseLongUserMessages && isLongUserMessage && !longMessageOpen

  const copyMessage = async () => {
    await copyText(message.content)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  const reusePrompt = () => {
    window.dispatchEvent(new CustomEvent('pi:reuse-prompt', { detail: message.content }))
  }

  return (
    <article className="conversation-message" data-role={message.role}>
      <div className="message-avatar" data-role={message.role}>{isUser ? '你' : <PiMark size={30} />}</div>
      <div className="message-column">
        <header className="message-header">
          <strong>{isUser ? '你' : 'Pi'}</strong>
          <time>
            {MESSAGE_TIME_FORMATTER.format(message.timestamp)}
          </time>
          {isUser && message.content ? (
            <span className="user-message-actions">
              <button type="button" title={copied ? '已复制' : '复制消息'} aria-label={copied ? '消息已复制' : '复制消息'} onClick={() => void copyMessage()}>{copied ? <Check size={13} /> : <Copy size={13} />}</button>
              <button type="button" title="重新编辑" aria-label="在输入框中重新编辑此消息" onClick={reusePrompt}><RotateCcw size={13} /></button>
            </span>
          ) : null}
        </header>
        {message.thinking ? <ThinkingDisclosure content={message.thinking} streaming={message.status === 'streaming'} /> : null}
        {message.content ? (
          <>
            <div className="message-content-shell" data-collapsed={messageCollapsed || undefined}>
              <Suspense fallback={<p className="message-plain">{message.content}</p>}>
                <MarkdownContent content={message.content} />
              </Suspense>
            </div>
            {collapseLongUserMessages && isLongUserMessage ? (
              <button className="long-message-toggle" type="button" aria-expanded={longMessageOpen} onClick={() => setLongMessageOpen((open) => !open)}>
                {longMessageOpen ? '收起消息' : '展开全文'}<ChevronDown data-open={longMessageOpen || undefined} size={14} />
              </button>
            ) : null}
          </>
        ) : message.status === 'streaming' ? (
          <div className="streaming-placeholder"><span /><span /><span /></div>
        ) : null}
        {message.error ? <p className="message-error">{message.error}</p> : null}
        {message.toolRuns?.length ? (
          <div className="tool-ledgers">
            {message.toolRuns.map((tool) => (
              <ToolLedger key={tool.id} tool={tool} />
            ))}
          </div>
        ) : null}
        {!isUser ? (
          <footer className="message-footer" aria-label="回复信息">
            <span className="message-meta-item message-model-identity" title={displayedProviderName ? `${displayedProviderName} · ${displayedModelName}` : displayedModelName}>
              <ProviderLogo providerId={displayedProviderId} providerName={displayedProviderName} size={17} className="message-provider-logo" />
              <span className="message-model">{displayedModelName}</span>
            </span>
            {message.thinkingLevel ? (
              <span className="message-meta-item message-thinking-level" title={`思考强度：${message.thinkingLevel}`}>
                <BrainCircuit size={13} />
                <span>{message.thinkingLevel}</span>
              </span>
            ) : null}
            <span className="message-meta-item message-mode" title="Pi 当前以构建模式运行"><Wrench size={13} /><span>build</span></span>
            <MessageDuration message={message} />
            <span className="message-meta-item message-time" title="回复时间">
              <Clock3 size={13} />
              <span>{formatMessageTimestamp(message.timestamp)}</span>
              {message.content ? (
                <button className="message-action" type="button" title={copied ? '已复制' : '复制回复'} aria-label={copied ? '回复已复制' : '复制回复'} onClick={() => void copyMessage()}>
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                </button>
              ) : null}
            </span>
          </footer>
        ) : null}
      </div>
    </article>
  )
})

export function ChatTimeline() {
  const messages = useAppStore((state) => state.messages)
  const sessionName = useAppStore((state) => state.sessionName)
  const sessionId = useAppStore((state) => state.sessionId)
  const sendPrompt = useAppStore((state) => state.sendPrompt)
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const pinnedToBottomRef = useRef(true)
  const [showJumpToLatest, setShowJumpToLatest] = useState(false)
  const lastMessage = messages.at(-1)
  const lastActivitySize = (lastMessage?.content.length ?? 0)
    + (lastMessage?.thinking?.length ?? 0)
    + (lastMessage?.toolRuns?.reduce((total, tool) => total + tool.output.length, 0) ?? 0)

  const updatePinnedState = () => {
    const viewport = scrollRef.current
    if (!viewport) return
    const nearBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 110
    pinnedToBottomRef.current = nearBottom
    setShowJumpToLatest((visible) => visible === !nearBottom ? visible : !nearBottom)
  }

  const jumpToLatest = () => {
    const viewport = scrollRef.current
    if (!viewport) return
    pinnedToBottomRef.current = true
    setShowJumpToLatest(false)
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' })
  }

  useEffect(() => {
    pinnedToBottomRef.current = true
    window.requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }))
  }, [sessionId])

  useEffect(() => {
    const viewport = scrollRef.current
    const content = contentRef.current
    if (!viewport || !content || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      if (pinnedToBottomRef.current) viewport.scrollTo({ top: viewport.scrollHeight })
    })
    observer.observe(content)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const viewport = scrollRef.current
    if (!viewport || !pinnedToBottomRef.current) return
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: lastMessage?.status === 'streaming' ? 'auto' : 'smooth' })
  }, [lastActivitySize, lastMessage?.status, messages.length])

  return (
    <div className="timeline-stage">
      <div className="timeline-scroll" ref={scrollRef} onScroll={updatePinnedState}>
        <div className="timeline-inner" ref={contentRef}>
          {messages.length ? (
            <>
              <h1 className="sr-only">{sessionName || '新任务'}</h1>
              <div className="conversation-list">
                {messages.map((message) => <ConversationMessage key={message.id} message={message} />)}
              </div>
            </>
          ) : (
            <div className="blank-thread">
              <div className="blank-thread-mark"><PiMark size={42} /></div>
              <h1>从一个清晰的目标开始</h1>
              <p>描述要构建、修复或理解的内容。Pi 会在当前项目中读取文件、执行命令并完成修改。</p>
              <div className="starter-prompts">
                <button type="button" onClick={() => void sendPrompt('解释这个项目的整体架构，并指出最重要的入口文件。')}>解释这个项目的架构</button>
                <button type="button" onClick={() => void sendPrompt('检查最近的 Git 变更，找出潜在问题并给出建议。')}>检查最近的 Git 变更</button>
                <button type="button" onClick={() => void sendPrompt('运行项目测试，并修复所有失败项。')}>运行测试并修复失败项</button>
              </div>
            </div>
          )}
        </div>
      </div>
      {showJumpToLatest ? <button className="jump-to-latest" type="button" onClick={jumpToLatest}><ArrowDown size={15} />回到最新消息</button> : null}
    </div>
  )
}
