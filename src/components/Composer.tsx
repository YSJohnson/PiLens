import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  ArrowUp,
  BrainCircuit,
  Check,
  ChevronDown,
  ChevronRight,
  File,
  Focus,
  Paperclip,
  Search,
  ShieldCheck,
  Square,
  Star,
  Target,
  Wrench,
  X,
} from 'lucide-react'
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import type { FileNode, ModelOption, ThinkingLevel } from '../shared/contracts'
import { useAppStore } from '../store/use-app-store'
import { useUiPreferences } from '../store/use-ui-preferences'
import { ProviderLogo } from './ProviderLogo'

interface ComposerProps {
  focusMode: boolean
  onToggleFocus: () => void
  onOpenSettings: () => void
}

type ModelFilter = 'all' | 'recent' | 'favorites'

const THINKING_LABELS: Record<ThinkingLevel, string> = {
  off: '关闭',
  minimal: '极简',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'XHigh',
  max: 'Max',
}

function contextLabel(value: number): string {
  if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(1))}M`
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`
  return String(value)
}

function readFavorites(): Set<string> {
  try {
    const stored = window.localStorage.getItem('pi-desktop:model-favorites')
    return new Set(stored ? JSON.parse(stored) as string[] : [])
  } catch {
    return new Set()
  }
}

function readStoredList(key: string): string[] {
  try {
    const value = window.localStorage.getItem(key)
    return value ? JSON.parse(value) as string[] : []
  } catch {
    return []
  }
}

function flattenFiles(nodes: FileNode[]): FileNode[] {
  return nodes.flatMap((node) => node.kind === 'file' ? [node] : flattenFiles(node.children ?? []))
}

function parentPath(path: string): string {
  const index = path.lastIndexOf('/')
  return index < 0 ? '项目根目录' : path.slice(0, index)
}

function ModelPicker({
  models,
  selected,
  disabled = false,
  onSelect,
  onOpenSettings,
}: {
  models: ModelOption[]
  selected?: ModelOption
  disabled?: boolean
  onSelect: (model: ModelOption) => void
  onOpenSettings: () => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ModelFilter>('all')
  const [favorites, setFavorites] = useState(readFavorites)
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(
    () => {
      const initialProvider = selected?.authenticated ? selected.provider : models.find((model) => model.authenticated)?.provider
      return new Set([...readStoredList('pi-desktop:model-provider-sections'), ...(initialProvider ? [initialProvider] : [])])
    },
  )
  const [recentKeys, setRecentKeys] = useState(() => readStoredList('pi-desktop:recent-models'))
  const [showAll, setShowAll] = useState<Set<string>>(new Set())
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase())
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const closeOnOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    window.setTimeout(() => searchRef.current?.focus(), 0)
    return () => {
      document.removeEventListener('mousedown', closeOnOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const availableModels = useMemo(() => models.filter((model) => model.authenticated), [models])
  const recentModels = useMemo(() => recentKeys
    .map((key) => availableModels.find((model) => model.key === key))
    .filter((model): model is ModelOption => Boolean(model)), [availableModels, recentKeys])

  const filteredModels = useMemo(() => {
    const candidates = filter === 'recent'
      ? recentModels
      : filter === 'favorites'
        ? availableModels.filter((model) => favorites.has(model.key))
        : availableModels

    if (!deferredQuery) return candidates
    return candidates.filter((model) => {
      const haystack = `${model.name} ${model.id} ${model.provider} ${model.providerName}`.toLocaleLowerCase()
      return haystack.includes(deferredQuery)
    })
  }, [availableModels, deferredQuery, favorites, filter, recentModels])

  const groups = useMemo(() => {
    if (filter === 'recent') return []
    const map = new Map<string, { id: string; name: string; models: ModelOption[] }>()
    for (const model of filteredModels) {
      const current = map.get(model.provider)
      if (current) current.models.push(model)
      else map.set(model.provider, {
        id: model.provider,
        name: model.providerName,
        models: [model],
      })
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [filter, filteredModels])

  const showRecentSection = filter === 'recent' || (!deferredQuery && filter === 'all')
  const visibleRecentModels = showRecentSection ? (filter === 'recent' ? filteredModels : recentModels.slice(0, 4)) : []
  const hasResults = visibleRecentModels.length > 0 || groups.length > 0

  const updateExpandedProviders = (updater: (current: Set<string>) => Set<string>) => {
    setExpandedProviders((current) => {
      const next = updater(current)
      window.localStorage.setItem('pi-desktop:model-provider-sections', JSON.stringify([...next]))
      return next
    })
  }

  const toggleFavorite = (key: string) => {
    setFavorites((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      window.localStorage.setItem('pi-desktop:model-favorites', JSON.stringify([...next]))
      return next
    })
  }

  const removeRecent = (key: string) => {
    setRecentKeys((current) => {
      const next = current.filter((item) => item !== key)
      window.localStorage.setItem('pi-desktop:recent-models', JSON.stringify(next))
      return next
    })
  }

  const chooseModel = (model: ModelOption) => {
    if (!model.authenticated) {
      setOpen(false)
      onOpenSettings()
      return
    }
    setRecentKeys((current) => {
      const next = [model.key, ...current.filter((key) => key !== model.key)].slice(0, 8)
      window.localStorage.setItem('pi-desktop:recent-models', JSON.stringify(next))
      return next
    })
    onSelect(model)
    setOpen(false)
  }

  const handlePickerKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.shiftKey && event.key === 'Delete') {
      const key = (document.activeElement as HTMLElement | null)?.dataset.modelKey
      if (key && recentKeys.includes(key)) {
        removeRecent(key)
        event.preventDefault()
      }
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const candidates = [...(rootRef.current?.querySelectorAll<HTMLButtonElement>('.model-option-main:not(:disabled)') ?? [])]
    if (!candidates.length) return
    const current = candidates.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'ArrowDown'
      ? current < candidates.length - 1 ? current + 1 : 0
      : current > 0 ? current - 1 : candidates.length - 1
    candidates[next]?.focus()
    event.preventDefault()
  }

  const renderModel = (model: ModelOption) => (
    <div className="model-option" data-selected={model.key === selected?.key || undefined} key={model.key}>
      <button className="model-option-main" data-model-key={model.key} type="button" onClick={() => chooseModel(model)}>
        <ProviderLogo providerId={model.provider} providerName={model.providerName} size={22} />
        <span className="model-option-copy">
          <strong>{model.name}</strong>
          <small>{model.providerName}</small>
        </span>
        <span
          className="model-context"
          title={`${model.contextWindow.toLocaleString()} tokens 上下文，最多输出 ${model.maxTokens.toLocaleString()} tokens`}
        >
          {contextLabel(model.contextWindow)}
        </span>
        {model.reasoning ? <span className="model-capability">推理</span> : null}
        {model.key === selected?.key ? <Check className="model-check" size={15} /> : null}
      </button>
      <button
        className="model-favorite"
        type="button"
        data-active={favorites.has(model.key) || undefined}
        onClick={() => toggleFavorite(model.key)}
        aria-label={favorites.has(model.key) ? `取消收藏 ${model.name}` : `收藏 ${model.name}`}
      >
        <Star size={15} fill={favorites.has(model.key) ? 'currentColor' : 'none'} />
      </button>
    </div>
  )

  return (
    <div className="model-picker-root" ref={rootRef}>
      <button
        className="composer-select model-trigger"
        type="button"
        disabled={disabled}
        title={disabled ? 'Pi 完成当前回复后可切换模型' : undefined}
        data-open={open || undefined}
        onClick={() => {
          const preferredProvider = selected?.authenticated ? selected.provider : availableModels[0]?.provider
          if (!open && preferredProvider) {
            updateExpandedProviders((current) => current.has(preferredProvider)
              ? current
              : new Set([...current, preferredProvider]))
          }
          setOpen((value) => !value)
        }}
      >
        <ProviderLogo providerId={selected?.provider} providerName={selected?.providerName} size={21} />
        <span className="composer-select-label">{selected?.name ?? '选择模型'}</span>
        <ChevronDown size={13} />
      </button>

      {open ? (
        <div className="model-picker-popover" role="dialog" aria-label="选择模型" onKeyDown={handlePickerKeys}>
          <header className="model-picker-header">
            <span><strong>可用模型</strong><small>{new Set(availableModels.map((model) => model.provider)).size} 个已连接服务</small></span>
            <button type="button" onClick={() => { setOpen(false); onOpenSettings() }}><span aria-hidden="true">＋</span>添加提供商</button>
          </header>
          <label className="model-search">
            <Search size={16} />
            <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索模型、提供商或能力" />
            {query ? <button type="button" onClick={() => setQuery('')} aria-label="清空搜索"><X size={14} /></button> : null}
          </label>
          <div className="model-filters" role="tablist" aria-label="模型筛选">
            {([
              ['all', '可用'],
              ['recent', '最近'],
              ['favorites', '收藏'],
            ] as const).map(([value, label]) => (
              <button key={value} role="tab" aria-selected={filter === value} type="button" data-active={filter === value || undefined} onClick={() => setFilter(value)}>{label}</button>
            ))}
          </div>

          <div className="model-picker-scroll">
            {visibleRecentModels.length ? (
              <section className="model-group recent-models">
                <div className="model-group-heading static"><span>最近使用</span><span>{visibleRecentModels.length}</span></div>
                {visibleRecentModels.map(renderModel)}
              </section>
            ) : null}

            {groups.map((group) => {
              const expanded = Boolean(deferredQuery) || filter !== 'all' || expandedProviders.has(group.id)
              const visibleModels = showAll.has(group.id) ? group.models : group.models.slice(0, deferredQuery ? 24 : 10)
              return (
                <section className="model-group" key={group.id}>
                  <button
                    className="model-group-heading"
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => updateExpandedProviders((current) => {
                      const next = new Set(current)
                      if (next.has(group.id)) next.delete(group.id)
                      else next.add(group.id)
                      return next
                    })}
                  >
                    <ChevronRight size={14} data-expanded={expanded || undefined} />
                    <ProviderLogo providerId={group.id} providerName={group.name} size={19} className="small" />
                    <strong>{group.name}</strong>
                    <span>{group.models.length}</span>
                  </button>
                  {expanded ? (
                    <div className="model-group-list">
                      {visibleModels.map(renderModel)}
                      {visibleModels.length < group.models.length ? (
                        <button className="show-more-models" type="button" onClick={() => setShowAll((current) => new Set([...current, group.id]))}>
                          显示其余 {group.models.length - visibleModels.length} 个模型
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </section>
              )
            })}

            {!hasResults ? (
              <div className="model-empty">
                {availableModels.length ? <Search size={20} /> : <ShieldCheck size={21} />}
                <strong>{availableModels.length === 0 ? '尚未连接模型服务' : deferredQuery ? '没有匹配的模型' : filter === 'recent' ? '还没有最近使用的模型' : '还没有收藏模型'}</strong>
                <span>{availableModels.length === 0 ? '连接 Provider 后，可用模型会自动出现在这里。' : deferredQuery ? '换个关键词，或切换筛选范围。' : filter === 'recent' ? '选择过的模型会保留在这里。' : '点击模型右侧的星标即可收藏。'}</span>
                {availableModels.length === 0 ? <button type="button" onClick={() => { setOpen(false); onOpenSettings() }}>前往 Provider 设置</button> : null}
              </div>
            ) : null}
          </div>
          <footer className="model-picker-footer"><span>↑↓ 导航</span><span><kbd>Enter</kbd> 选择</span><span><kbd>Shift Del</kbd> 清除最近</span><span>{filteredModels.length} 个可用模型</span></footer>
        </div>
      ) : null}
    </div>
  )
}

export function Composer({ focusMode, onToggleFocus, onOpenSettings }: ComposerProps) {
  const [value, setValue] = useState('')
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [suggestionIndex, setSuggestionIndex] = useState(0)
  const [historyIndex, setHistoryIndex] = useState(-1)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const models = useAppStore((state) => state.models)
  const files = useAppStore((state) => state.files)
  const messages = useAppStore((state) => state.messages)
  const modelKey = useAppStore((state) => state.modelKey)
  const thinkingLevel = useAppStore((state) => state.thinkingLevel)
  const streaming = useAppStore((state) => state.streaming)
  const sendPrompt = useAppStore((state) => state.sendPrompt)
  const abortAgent = useAppStore((state) => state.abortAgent)
  const setModel = useAppStore((state) => state.setModel)
  const followUpBehavior = useUiPreferences((state) => state.followUpBehavior)
  const autoNamingMode = useUiPreferences((state) => state.autoNamingMode)

  const selectedModel = useMemo(() => {
    const configured = models.find((model) => model.key === modelKey)
    return configured?.authenticated ? configured : models.find((model) => model.authenticated)
  }, [modelKey, models])
  const levels = selectedModel?.thinkingLevels ?? (['off', 'medium', 'high'] as ThinkingLevel[])
  const allFiles = useMemo(() => flattenFiles(files), [files])
  const promptHistory = useMemo(() => messages
    .filter((message) => message.role === 'user' && message.content.trim())
    .map((message) => message.content), [messages])
  const mentionMatch = value.match(/@([^\s@]*)$/)
  const mentionQuery = mentionMatch?.[1].toLocaleLowerCase() ?? ''
  const fileSuggestions = useMemo(() => {
    if (!suggestionsOpen || !mentionMatch) return []
    return allFiles
      .filter((file) => !mentionQuery || `${file.name} ${file.path}`.toLocaleLowerCase().includes(mentionQuery))
      .sort((a, b) => {
        const aPrefix = a.name.toLocaleLowerCase().startsWith(mentionQuery)
        const bPrefix = b.name.toLocaleLowerCase().startsWith(mentionQuery)
        if (aPrefix !== bPrefix) return aPrefix ? -1 : 1
        return a.path.length - b.path.length || a.path.localeCompare(b.path)
      })
      .slice(0, 8)
  }, [allFiles, mentionMatch, mentionQuery, suggestionsOpen])

  const setComposerText = useCallback((text: string, focus = true) => {
    setValue(text)
    window.requestAnimationFrame(() => {
      const textarea = textareaRef.current
      if (!textarea) return
      textarea.style.height = '0px'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 168)}px`
      if (focus) {
        textarea.focus()
        textarea.setSelectionRange(text.length, text.length)
      }
    })
  }, [])

  const insertFileMention = (path: string) => {
    const start = mentionMatch?.index ?? value.length
    const before = value.slice(0, start)
    const spacer = before && !/\s$/.test(before) ? ' ' : ''
    setComposerText(`${before}${spacer}@${path} `)
    setSuggestionsOpen(false)
    setSuggestionIndex(0)
  }

  const openFileSuggestions = () => {
    const spacer = value && !/\s$/.test(value) ? ' ' : ''
    setComposerText(`${value}${spacer}@`)
    setSuggestionsOpen(true)
    setSuggestionIndex(0)
  }

  const submit = async () => {
    const prompt = value.trim()
    if (!prompt) return
    if (!selectedModel) {
      onOpenSettings()
      return
    }
    setValue('')
    setSuggestionsOpen(false)
    setHistoryIndex(-1)
    if (textareaRef.current) textareaRef.current.style.height = ''
    const sent = await sendPrompt(prompt, streaming ? followUpBehavior : undefined, autoNamingMode)
    if (!sent) setComposerText(prompt)
  }

  const selectModel = useCallback((model: ModelOption) => {
    const nextLevel = model.thinkingLevels.includes(thinkingLevel)
      ? thinkingLevel
      : model.thinkingLevels.includes('medium')
        ? 'medium'
        : model.thinkingLevels[0]
    void setModel(model.key, nextLevel)
  }, [setModel, thinkingLevel])

  useEffect(() => {
    if (!selectedModel || selectedModel.key === modelKey || streaming) return
    selectModel(selectedModel)
  }, [modelKey, selectModel, selectedModel, streaming])

  useEffect(() => {
    const reusePrompt = (event: Event) => {
      const text = (event as CustomEvent<string>).detail
      if (!text) return
      setComposerText(text)
      setSuggestionsOpen(false)
      setHistoryIndex(-1)
    }
    window.addEventListener('pi:reuse-prompt', reusePrompt)
    return () => window.removeEventListener('pi:reuse-prompt', reusePrompt)
  }, [setComposerText])

  return (
    <div className="composer-region" data-focus={focusMode || undefined}>
      <div className="composer" data-streaming={streaming || undefined}>
        <textarea
          ref={textareaRef}
          value={value}
          rows={1}
          placeholder={streaming
            ? followUpBehavior === 'followUp'
              ? '添加后续要求，Pi 完成当前回复后继续…'
              : '补充当前任务，Pi 将尽快调整方向…'
            : '@ 引用项目文件，Shift+Enter 换行，Enter 发送'}
          onChange={(event) => {
            setValue(event.target.value)
            setSuggestionsOpen(true)
            setSuggestionIndex(0)
            setHistoryIndex(-1)
            event.currentTarget.style.height = '0px'
            event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 168)}px`
          }}
          onKeyDown={(event) => {
            if (suggestionsOpen && mentionMatch && fileSuggestions.length) {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                setSuggestionIndex((index) => event.key === 'ArrowDown'
                  ? (index + 1) % fileSuggestions.length
                  : (index - 1 + fileSuggestions.length) % fileSuggestions.length)
                event.preventDefault()
                return
              }
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                insertFileMention(fileSuggestions[Math.min(suggestionIndex, fileSuggestions.length - 1)].path)
                event.preventDefault()
                return
              }
            }
            if (event.key === 'Escape' && suggestionsOpen) {
              setSuggestionsOpen(false)
              event.preventDefault()
              return
            }
            if (event.key === 'ArrowUp' && !event.shiftKey && (historyIndex >= 0 || !value.trim()) && promptHistory.length) {
              const next = Math.min(historyIndex + 1, promptHistory.length - 1)
              setHistoryIndex(next)
              setComposerText(promptHistory[promptHistory.length - 1 - next])
              event.preventDefault()
              return
            }
            if (event.key === 'ArrowDown' && !event.shiftKey && historyIndex >= 0) {
              const next = historyIndex - 1
              setHistoryIndex(next)
              setComposerText(next < 0 ? '' : promptHistory[promptHistory.length - 1 - next])
              event.preventDefault()
              return
            }
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              void submit()
            }
          }}
        />

        {suggestionsOpen && mentionMatch ? (
          <div className="composer-suggestions" role="listbox" aria-label="项目文件建议">
            <header><span><File size={14} />引用项目文件</span><small>↑↓ 选择 · Enter 插入</small></header>
            <div>
              {fileSuggestions.map((file, index) => (
                <button
                  key={file.path}
                  type="button"
                  role="option"
                  aria-selected={index === Math.min(suggestionIndex, fileSuggestions.length - 1)}
                  data-active={index === Math.min(suggestionIndex, fileSuggestions.length - 1) || undefined}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => insertFileMention(file.path)}
                >
                  <File size={15} />
                  <span><strong>{file.name}</strong><small>{parentPath(file.path)}</small></span>
                  <code>@{file.path}</code>
                </button>
              ))}
              {!fileSuggestions.length ? <p>没有匹配的项目文件</p> : null}
            </div>
          </div>
        ) : null}

        <div className="composer-toolbar">
          <div className="composer-tools">
            <button className="composer-icon-button" type="button" aria-label="引用文件" title="引用项目文件" onClick={openFileSuggestions}><Paperclip size={17} /></button>
            <button className="composer-icon-button" type="button" aria-label={focusMode ? '退出专注模式' : '进入专注模式'} title={focusMode ? '退出专注模式' : '专注模式'} aria-pressed={focusMode} data-active={focusMode || undefined} onClick={onToggleFocus}><Focus size={17} /></button>
            <button className="composer-icon-button" type="button" aria-label="Provider 设置" title="Provider 设置" onClick={onOpenSettings}><ShieldCheck size={17} /></button>
            <button
              className="composer-icon-button"
              type="button"
              aria-label="插入目标模板"
              title="插入目标模板"
              onClick={() => setComposerText(value ? `${value}\n\n目标：\n完成标准：\n约束：` : '目标：\n完成标准：\n约束：')}
            >
              <Target size={17} />
            </button>
            {streaming ? (
              <span className="queue-hint" data-behavior={followUpBehavior}>
                <span />{followUpBehavior === 'followUp' ? '排队到当前回复之后' : '追加到当前回复'}
              </span>
            ) : null}
          </div>

          <div className="composer-actions">
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button className="composer-select thinking-select" type="button" disabled={!selectedModel || streaming} title={streaming ? 'Pi 完成当前回复后可调整思考级别' : undefined} aria-label={`思考级别：${THINKING_LABELS[thinkingLevel]}`}><BrainCircuit size={15} /><span>{THINKING_LABELS[thinkingLevel]}</span><ChevronDown size={13} /></button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content className="dropdown-content thinking-menu" side="top" align="end" sideOffset={9}>
                  <DropdownMenu.Label className="dropdown-label">思考级别</DropdownMenu.Label>
                  {levels.map((level) => (
                    <DropdownMenu.Item key={level} className="dropdown-item" onSelect={() => selectedModel && void setModel(selectedModel.key, level)}>
                      {THINKING_LABELS[level]}{level === thinkingLevel ? <Check size={14} /> : null}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>

            <ModelPicker key={streaming ? 'model-locked' : 'model-ready'} models={models} selected={selectedModel} disabled={streaming} onSelect={selectModel} onOpenSettings={onOpenSettings} />

            <span className="composer-mode-indicator" title="Pi 当前以构建模式运行"><Wrench size={15} /><span>Build</span></span>
            {streaming && !value.trim() ? (
              <button className="stop-button" type="button" aria-label="停止 Pi" onClick={() => void abortAgent()}><Square size={12} fill="currentColor" /></button>
            ) : (
              <button className="send-button" type="button" aria-label={selectedModel ? '发送' : '请先连接并选择模型'} title={selectedModel ? '发送' : '请先连接并选择模型'} disabled={!value.trim() || !selectedModel} onClick={() => void submit()}><ArrowUp size={18} strokeWidth={2.2} /></button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
