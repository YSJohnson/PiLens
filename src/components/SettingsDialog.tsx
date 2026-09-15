import * as Dialog from '@radix-ui/react-dialog'
import {
  Bot,
  BellOff,
  BellRing,
  BrainCircuit,
  Check,
  CheckCircle2,
  CornerUpRight,
  KeyRound,
  Laptop,
  ListEnd,
  LoaderCircle,
  LogIn,
  MessageSquareText,
  Monitor,
  Moon,
  Paintbrush,
  Plus,
  Puzzle,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sun,
  TerminalSquare,
  Unplug,
  WandSparkles,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../store/use-app-store'
import { useUiPreferences } from '../store/use-ui-preferences'
import { ProviderLogo } from './ProviderLogo'
import { CustomModelEditor } from './CustomModelEditor'
import { ResourceManager } from './ResourceManager'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  section: SettingsSection
  onSectionChange: (section: SettingsSection) => void
}

export type SettingsSection = 'general' | 'chat' | 'appearance' | 'providers' | 'resources'
type TypeScale = 'comfortable' | 'large'

const SECTION_COPY: Record<SettingsSection, { title: string; description: string }> = {
  general: { title: '通用', description: '工作区、运行时与桌面应用信息。' },
  chat: { title: '对话', description: '调整消息发送、思考过程与工具结果的呈现方式。' },
  appearance: { title: '外观', description: '调整阅读舒适度与界面信息密度。' },
  providers: { title: 'Provider 与模型', description: '连接模型服务并管理 Pi 可使用的模型目录。' },
  resources: { title: 'Skills 与 Plugins', description: '安装、创建和控制 Pi 在当前会话中加载的能力。' },
}

function initialScale(): TypeScale {
  return window.localStorage.getItem('pi-desktop:type-scale') === 'large' ? 'large' : 'comfortable'
}

export function SettingsDialog({ open, onOpenChange, section, onSectionChange }: SettingsDialogProps) {
  const providers = useAppStore((state) => state.providers)
  const models = useAppStore((state) => state.models)
  const project = useAppStore((state) => state.project)
  const version = useAppStore((state) => state.version)
  const saveProviderKey = useAppStore((state) => state.saveProviderKey)
  const refreshModels = useAppStore((state) => state.refreshModels)
  const loginProvider = useAppStore((state) => state.loginProvider)
  const disconnectProvider = useAppStore((state) => state.disconnectProvider)
  const busy = useAppStore((state) => state.busy)
  const thinkingDefaultExpanded = useUiPreferences((state) => state.thinkingDefaultExpanded)
  const setThinkingDefaultExpanded = useUiPreferences((state) => state.setThinkingDefaultExpanded)
  const toolOutputDefaultExpanded = useUiPreferences((state) => state.toolOutputDefaultExpanded)
  const setToolOutputDefaultExpanded = useUiPreferences((state) => state.setToolOutputDefaultExpanded)
  const followUpBehavior = useUiPreferences((state) => state.followUpBehavior)
  const setFollowUpBehavior = useUiPreferences((state) => state.setFollowUpBehavior)
  const collapseLongUserMessages = useUiPreferences((state) => state.collapseLongUserMessages)
  const setCollapseLongUserMessages = useUiPreferences((state) => state.setCollapseLongUserMessages)
  const completionSound = useUiPreferences((state) => state.completionSound)
  const setCompletionSound = useUiPreferences((state) => state.setCompletionSound)
  const themePreference = useUiPreferences((state) => state.themePreference)
  const setThemePreference = useUiPreferences((state) => state.setThemePreference)
  const autoNamingMode = useUiPreferences((state) => state.autoNamingMode)
  const setAutoNamingMode = useUiPreferences((state) => state.setAutoNamingMode)
  const [search, setSearch] = useState('')
  const [typeScale, setTypeScale] = useState<TypeScale>(initialScale)
  const [selectedProvider, setSelectedProvider] = useState(providers[0]?.id ?? 'anthropic')
  const [apiKey, setApiKey] = useState('')
  const [remember, setRemember] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [disconnectArmed, setDisconnectArmed] = useState<string>()
  const [customModelMode, setCustomModelMode] = useState(false)

  useEffect(() => {
    document.documentElement.dataset.typeScale = typeScale
  }, [typeScale])

  const currentProviderId = providers.some((provider) => provider.id === selectedProvider)
    ? selectedProvider
    : providers[0]?.id ?? selectedProvider
  const provider = providers.find((item) => item.id === currentProviderId)
  const providerModels = useMemo(() => models.filter((model) => model.provider === currentProviderId), [currentProviderId, models])

  const setScale = (next: TypeScale) => {
    setTypeScale(next)
    window.localStorage.setItem('pi-desktop:type-scale', next)
  }

  const submit = async () => {
    if (!apiKey.trim()) return
    setSaving(true)
    setSaved(false)
    try {
      const connected = await saveProviderKey(currentProviderId, apiKey, remember)
      if (!connected) return
      setApiKey('')
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2200)
    } finally {
      setSaving(false)
    }
  }

  const navItems = [
    { id: 'general' as const, label: '通用', icon: Settings2, keywords: '通用 启动 运行 本地' },
    { id: 'chat' as const, label: '对话', icon: MessageSquareText, keywords: '对话 消息 排队 引导 思考 工具 输出 展开 折叠' },
    { id: 'appearance' as const, label: '外观', icon: Paintbrush, keywords: '外观 字号 颜色 密度 主题' },
    { id: 'providers' as const, label: 'Provider 与模型', icon: Bot, keywords: 'provider 模型 api key anthropic openai google' },
    { id: 'resources' as const, label: 'Skills 与 Plugins', icon: Puzzle, keywords: 'skills plugins extension 插件 技能 工具 命令' },
  ].filter((item) => !search.trim() || `${item.label} ${item.keywords}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="settings-dialog" aria-describedby="settings-description">
          <Dialog.Description className="sr-only" id="settings-description">配置 PiLens 的外观、运行环境和模型 Provider。</Dialog.Description>

          <aside className="settings-sidebar">
            <div className="settings-search">
              <Search size={15} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索设置" />
            </div>
            <span className="settings-nav-label">PILENS</span>
            <nav className="settings-nav" aria-label="设置板块">
              {navItems.map(({ id, label, icon: Icon }) => (
                <button key={id} type="button" aria-label={label} title={label} data-active={section === id || undefined} onClick={() => onSectionChange(id)}>
                  <Icon size={16} /><span>{label}</span>
                </button>
              ))}
            </nav>
            <div className="settings-runtime-note"><Laptop size={15} /><span><strong>本地运行</strong><small>PiLens {version}</small></span></div>
          </aside>

          <main className="settings-main">
            <header className="settings-header">
              <div>
                <Dialog.Title>{SECTION_COPY[section].title}</Dialog.Title>
                <p>{SECTION_COPY[section].description}</p>
              </div>
              <Dialog.Close asChild><button className="icon-button" type="button" aria-label="关闭设置"><X size={18} /></button></Dialog.Close>
            </header>

            <div className="settings-content">
              {section === 'general' ? (
                <>
                  <section className="settings-section">
                    <div className="section-title"><div><h3>桌面运行时</h3><p>Pi 在本机项目目录中执行任务，会话可随时恢复。</p></div><span className="settings-badge success"><CheckCircle2 size={14} />已连接</span></div>
                    <dl className="settings-details">
                      <div><dt>运行模式</dt><dd>本地</dd></div>
                      <div><dt>当前项目</dt><dd>{project?.name ?? '未打开项目'}</dd></div>
                      <div><dt>项目路径</dt><dd title={project?.path}>{project?.path ?? '—'}</dd></div>
                      <div><dt>版本</dt><dd>{version}</dd></div>
                    </dl>
                  </section>
                  <section className="settings-section">
                    <div className="section-title"><div><h3>数据与隐私</h3><p>会话、Provider 配置和项目索引保存在本机。</p></div><ShieldCheck size={18} /></div>
                    <div className="privacy-callout"><ShieldCheck size={20} /><span><strong>本地优先</strong><small>API Key 使用系统凭据保护；PiLens 不会将项目文件上传到额外服务。</small></span></div>
                  </section>
                </>
              ) : null}

              {section === 'chat' ? (
                <>
                  <section className="settings-section">
                    <div className="section-title"><div><h3>回复期间发送消息</h3><p>当 Pi 正在工作时，决定新消息何时生效。</p></div><MessageSquareText size={18} /></div>
                    <div className="appearance-options reasoning-options">
                      <button type="button" data-active={followUpBehavior === 'followUp' || undefined} onClick={() => setFollowUpBehavior('followUp')}>
                        <span className="choice-icon"><ListEnd size={20} /></span><span><strong>排队</strong><small>当前回复完成后再执行</small></span>{followUpBehavior === 'followUp' ? <Check size={16} /> : null}
                      </button>
                      <button type="button" data-active={followUpBehavior === 'steer' || undefined} onClick={() => setFollowUpBehavior('steer')}>
                        <span className="choice-icon"><CornerUpRight size={20} /></span><span><strong>引导</strong><small>追加要求到当前回复</small></span>{followUpBehavior === 'steer' ? <Check size={16} /> : null}
                      </button>
                    </div>
                  </section>
                  <section className="settings-section">
                    <div className="section-title"><div><h3>思考过程</h3><p>决定新出现的思考内容在对话中如何显示，仍可逐条手动切换。</p></div><BrainCircuit size={18} /></div>
                    <div className="appearance-options reasoning-options">
                      <button type="button" data-active={thinkingDefaultExpanded || undefined} onClick={() => setThinkingDefaultExpanded(true)}>
                        <span className="reasoning-preview"><BrainCircuit size={18} /><span /></span><span><strong>默认展开</strong><small>直接查看 Pi 的推理进度</small></span>{thinkingDefaultExpanded ? <Check size={16} /> : null}
                      </button>
                      <button type="button" data-active={!thinkingDefaultExpanded || undefined} onClick={() => setThinkingDefaultExpanded(false)}>
                        <span className="reasoning-preview collapsed"><BrainCircuit size={18} /><span /></span><span><strong>默认折叠</strong><small>需要时再展开查看</small></span>{!thinkingDefaultExpanded ? <Check size={16} /> : null}
                      </button>
                    </div>
                  </section>
                  <section className="settings-section">
                    <div className="section-title"><div><h3>工具输出</h3><p>控制命令、文件操作等执行详情的初始状态，逐项仍可手动切换。</p></div><TerminalSquare size={18} /></div>
                    <div className="appearance-options reasoning-options">
                      <button type="button" data-active={toolOutputDefaultExpanded || undefined} onClick={() => setToolOutputDefaultExpanded(true)}>
                        <span className="reasoning-preview tool-preview"><TerminalSquare size={18} /><span /></span><span><strong>默认展开</strong><small>执行过程与结果直接可见</small></span>{toolOutputDefaultExpanded ? <Check size={16} /> : null}
                      </button>
                      <button type="button" data-active={!toolOutputDefaultExpanded || undefined} onClick={() => setToolOutputDefaultExpanded(false)}>
                        <span className="reasoning-preview collapsed tool-preview"><TerminalSquare size={18} /><span /></span><span><strong>默认折叠</strong><small>保持对话内容更加紧凑</small></span>{!toolOutputDefaultExpanded ? <Check size={16} /> : null}
                      </button>
                    </div>
                  </section>
                  <section className="settings-section">
                    <div className="section-title"><div><h3>长用户消息</h3><p>折叠较长的已发送消息，减少回看对话时的滚动距离。</p></div></div>
                    <div className="appearance-options reasoning-options">
                      <button type="button" data-active={!collapseLongUserMessages || undefined} onClick={() => setCollapseLongUserMessages(false)}>
                        <span className="choice-icon"><MessageSquareText size={20} /></span><span><strong>保持完整</strong><small>始终显示全部正文</small></span>{!collapseLongUserMessages ? <Check size={16} /> : null}
                      </button>
                      <button type="button" data-active={collapseLongUserMessages || undefined} onClick={() => setCollapseLongUserMessages(true)}>
                        <span className="reasoning-preview collapsed"><MessageSquareText size={18} /><span /></span><span><strong>自动折叠</strong><small>长消息可随时展开</small></span>{collapseLongUserMessages ? <Check size={16} /> : null}
                      </button>
                    </div>
                  </section>
                  <section className="settings-section">
                    <div className="section-title"><div><h3>会话自动命名</h3><p>新会话先立即获得可读标题，任务完成后可由当前模型生成更准确的语义标题。</p></div><WandSparkles size={18} /></div>
                    <div className="appearance-options auto-name-options">
                      <button type="button" data-active={autoNamingMode === 'smart' || undefined} onClick={() => setAutoNamingMode('smart')}>
                        <span className="choice-icon"><WandSparkles size={20} /></span><span><strong>智能命名</strong><small>默认 · 使用一次轻量模型请求</small></span>{autoNamingMode === 'smart' ? <Check size={16} /> : null}
                      </button>
                      <button type="button" data-active={autoNamingMode === 'prompt' || undefined} onClick={() => setAutoNamingMode('prompt')}>
                        <span className="choice-icon"><MessageSquareText size={20} /></span><span><strong>根据首条消息</strong><small>本地生成，不产生额外请求</small></span>{autoNamingMode === 'prompt' ? <Check size={16} /> : null}
                      </button>
                      <button type="button" data-active={autoNamingMode === 'off' || undefined} onClick={() => setAutoNamingMode('off')}>
                        <span className="choice-icon"><X size={20} /></span><span><strong>关闭</strong><small>保留“新任务”，可手动重命名</small></span>{autoNamingMode === 'off' ? <Check size={16} /> : null}
                      </button>
                    </div>
                  </section>
                  <section className="settings-section">
                    <div className="section-title"><div><h3>完成提示音</h3><p>Pi 完成工作后播放系统提示音；关闭窗口再打开也会保留此选择。</p></div><BellRing size={18} /></div>
                    <div className="appearance-options reasoning-options">
                      <button type="button" data-active={completionSound || undefined} onClick={() => setCompletionSound(true)}>
                        <span className="choice-icon"><BellRing size={20} /></span><span><strong>开启</strong><small>任务完成时提醒我</small></span>{completionSound ? <Check size={16} /> : null}
                      </button>
                      <button type="button" data-active={!completionSound || undefined} onClick={() => setCompletionSound(false)}>
                        <span className="choice-icon"><BellOff size={20} /></span><span><strong>静音</strong><small>只显示运行状态</small></span>{!completionSound ? <Check size={16} /> : null}
                      </button>
                    </div>
                  </section>
                </>
              ) : null}

              {section === 'appearance' ? (
                <>
                  <section className="settings-section">
                    <div className="section-title"><div><h3>界面字号</h3><p>默认字号已按桌面阅读优化，你也可以进一步放大。</p></div><Paintbrush size={18} /></div>
                    <div className="appearance-options">
                      <button type="button" data-active={typeScale === 'comfortable' || undefined} onClick={() => setScale('comfortable')}>
                        <span className="type-preview normal">Aa</span><span><strong>舒适</strong><small>正文 16px，控件 15px</small></span>{typeScale === 'comfortable' ? <Check size={16} /> : null}
                      </button>
                      <button type="button" data-active={typeScale === 'large' || undefined} onClick={() => setScale('large')}>
                        <span className="type-preview large">Aa</span><span><strong>大字号</strong><small>正文 17px，控件 16px</small></span>{typeScale === 'large' ? <Check size={16} /> : null}
                      </button>
                    </div>
                  </section>
                  <section className="settings-section">
                    <div className="section-title"><div><h3>主题</h3><p>切换后立即生效，并在下次启动时恢复。</p></div></div>
                    <div className="appearance-options theme-options">
                      <button type="button" data-theme-preview="dark" data-active={themePreference === 'dark' || undefined} onClick={() => setThemePreference('dark')}>
                        <span className="theme-swatch"><Moon size={18} /><i /><i /><i /></span><span><strong>深色</strong><small>OpenChamber 风格炭黑主题</small></span>{themePreference === 'dark' ? <Check size={16} /> : null}
                      </button>
                      <button type="button" data-theme-preview="light" data-active={themePreference === 'light' || undefined} onClick={() => setThemePreference('light')}>
                        <span className="theme-swatch"><Sun size={18} /><i /><i /><i /></span><span><strong>浅色</strong><small>清晰明亮的工作区</small></span>{themePreference === 'light' ? <Check size={16} /> : null}
                      </button>
                      <button type="button" data-theme-preview="system" data-active={themePreference === 'system' || undefined} onClick={() => setThemePreference('system')}>
                        <span className="theme-swatch"><Monitor size={18} /><i /><i /><i /></span><span><strong>跟随系统</strong><small>自动匹配 Windows 外观</small></span>{themePreference === 'system' ? <Check size={16} /> : null}
                      </button>
                    </div>
                  </section>
                </>
              ) : null}

              {section === 'providers' ? (
                <div className="provider-settings-layout">
                  <nav className="provider-list" aria-label="Provider">
                    {providers.map((item) => (
                      <button key={item.id} type="button" data-active={!customModelMode && currentProviderId === item.id || undefined} onClick={() => { setSelectedProvider(item.id); setSaved(false); setDisconnectArmed(undefined); setCustomModelMode(false) }}>
                        <ProviderLogo providerId={item.id} providerName={item.name} size={28} className="settings-provider-logo" />
                        <span><strong>{item.name}</strong><small>{models.filter((model) => model.provider === item.id).length} 个模型</small></span>
                        <i data-connected={item.authenticated || undefined} />
                      </button>
                    ))}
                    <button className="custom-provider-button" type="button" data-active={customModelMode || undefined} onClick={() => setCustomModelMode(true)}><span><Plus size={16} /></span><span><strong>自定义模型</strong><small>本地或兼容 API</small></span></button>
                  </nav>

                  {customModelMode ? (
                    <CustomModelEditor onBack={() => setCustomModelMode(false)} onProviderSaved={(providerId) => { setSelectedProvider(providerId); setCustomModelMode(false) }} />
                  ) : <div className="provider-settings">
                    <div className="provider-heading">
                      <ProviderLogo providerId={provider?.id} providerName={provider?.name} size={44} className="provider-large-logo" />
                      <div><h2>{provider?.name ?? 'Provider'}</h2><p>{provider?.authenticated ? `已通过${provider.usingOAuth ? ' OAuth' : ''}连接，可以立即用于新会话。` : '选择 OAuth 或 API Key 完成连接。'}</p></div>
                      <span className="provider-status" data-connected={provider?.authenticated || undefined}>{provider?.authenticated ? <CheckCircle2 size={14} /> : <KeyRound size={14} />}{provider?.authenticated ? provider.usingOAuth ? 'OAuth' : '已连接' : '未连接'}</span>
                    </div>

                    <section className="settings-section provider-auth-section">
                      <div className="section-title"><div><h3>连接方式</h3><p>只显示 {provider?.name ?? '当前 Provider'} 实际支持的认证方式。</p></div><ShieldCheck size={18} /></div>
                      <div className="provider-auth-methods">
                        {provider?.authMethods.includes('oauth') ? <button type="button" disabled={provider.usingOAuth} data-connected={provider.usingOAuth || undefined} onClick={() => void loginProvider(provider.id)}><span className="provider-auth-icon"><LogIn size={18} /></span><span><strong>{provider.usingOAuth ? 'OAuth 已连接' : `使用 ${provider.name} 登录`}</strong><small>在系统浏览器完成官方授权</small></span>{provider.usingOAuth ? <CheckCircle2 size={16} /> : null}</button> : null}
                        {provider?.authMethods.includes('api_key') ? <div className="provider-auth-method"><span className="provider-auth-icon"><KeyRound size={18} /></span><span><strong>API Key</strong><small>使用本机加密凭据连接</small></span>{provider.authenticated && !provider.usingOAuth ? <CheckCircle2 size={16} /> : null}</div> : null}
                      </div>
                      {provider?.authenticated ? <div className="disconnect-row"><span>{provider.authLabel}</span><button type="button" data-armed={disconnectArmed === provider.id || undefined} onClick={() => { if (disconnectArmed !== provider.id) { setDisconnectArmed(provider.id); return }; void disconnectProvider(provider.id).then((ok) => { if (ok) setDisconnectArmed(undefined) }) }}><Unplug size={14} />{disconnectArmed === provider.id ? '再次点击确认' : '移除本地凭据'}</button></div> : null}
                    </section>

                    {provider?.authMethods.includes('api_key') ? (
                      <section className="settings-section">
                        <div className="section-title"><div><h3>API Key</h3><p>密钥只会发送给对应 Provider。</p></div><ShieldCheck size={18} /></div>
                        <label className="key-input"><KeyRound size={16} /><input type="password" value={apiKey} autoComplete="off" placeholder={provider?.authenticated ? '输入新密钥以替换当前配置' : '粘贴 API Key'} onChange={(event) => setApiKey(event.target.value)} /></label>
                        <label className="remember-key"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /><span>使用系统凭据加密后记住此密钥</span></label>
                        <div className="settings-actions-row"><span>{provider?.authLabel}</span><button className="settings-save" type="button" disabled={!apiKey.trim() || saving} onClick={() => void submit()}>{saving ? <LoaderCircle className="spin" size={15} /> : saved ? <CheckCircle2 size={15} /> : null}{saving ? '连接中…' : saved ? '已保存' : '保存并连接'}</button></div>
                      </section>
                    ) : null}

                    <section className="settings-section model-catalog-section">
                      <div className="section-title"><div><h3>模型目录</h3><p>当前发现 {providerModels.length} 个模型。</p></div><button className="secondary-button" type="button" disabled={busy} onClick={() => void refreshModels()}><RefreshCw className={busy ? 'spin' : ''} size={14} />刷新</button></div>
                      <div className="model-catalog-preview">
                        {providerModels.slice(0, 7).map((model) => <div key={model.key}><span>{model.name}</span><small>{Math.round(model.contextWindow / 1000)}K</small></div>)}
                        {!providerModels.length ? <p>连接 Provider 并刷新后显示可用模型。</p> : null}
                      </div>
                    </section>
                  </div>}
                </div>
              ) : null}

              {section === 'resources' ? (
                <ResourceManager onInvokeSkill={(name) => { window.dispatchEvent(new CustomEvent('pi:reuse-prompt', { detail: `/skill:${name} ` })); onOpenChange(false) }} />
              ) : null}
            </div>
          </main>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
