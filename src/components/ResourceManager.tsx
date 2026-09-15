import {
  AlertTriangle,
  Check,
  CornerUpRight,
  FolderOpen,
  Package,
  PackagePlus,
  Plus,
  Puzzle,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { PluginResource, ResourceKind, ResourceScope, SkillResource } from '../shared/contracts'
import { useAppStore } from '../store/use-app-store'

type ResourceTab = 'skills' | 'plugins' | 'packages'
type PersistedScope = Exclude<ResourceScope, 'temporary'>

interface ResourceManagerProps {
  onInvokeSkill: (name: string) => void
}

const SCOPE_LABEL: Record<ResourceScope, string> = {
  project: '项目',
  user: '全局',
  temporary: '临时',
}

export function ResourceManager({ onInvokeSkill }: ResourceManagerProps) {
  const project = useAppStore((state) => state.project)
  const resources = useAppStore((state) => state.resources)
  const busy = useAppStore((state) => state.resourcesBusy)
  const progress = useAppStore((state) => state.resourceProgress)
  const reloadResources = useAppStore((state) => state.reloadResources)
  const getResources = useAppStore((state) => state.getResources)
  const openResource = useAppStore((state) => state.openResource)
  const setResourceEnabled = useAppStore((state) => state.setResourceEnabled)
  const installResourcePackage = useAppStore((state) => state.installResourcePackage)
  const removeResourcePackage = useAppStore((state) => state.removeResourcePackage)
  const updateResourcePackage = useAppStore((state) => state.updateResourcePackage)
  const createResourceTemplate = useAppStore((state) => state.createResourceTemplate)
  const [tab, setTab] = useState<ResourceTab>('skills')
  const [installOpen, setInstallOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [packageSource, setPackageSource] = useState('')
  const [scope, setScope] = useState<PersistedScope>('user')
  const [trusted, setTrusted] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templateDescription, setTemplateDescription] = useState('')
  const [removeArmed, setRemoveArmed] = useState<string>()

  useEffect(() => {
    void getResources()
  }, [getResources])

  const activeCount = useMemo(() => ({
    skills: resources.skills.filter((resource) => resource.enabled).length,
    plugins: resources.plugins.filter((resource) => resource.enabled).length,
    packages: resources.packages.length,
  }), [resources])

  const installPackage = async () => {
    if (!packageSource.trim() || !trusted) return
    if (await installResourcePackage(packageSource.trim(), scope)) {
      setPackageSource('')
      setTrusted(false)
      setInstallOpen(false)
    }
  }

  const createTemplate = async () => {
    const kind: ResourceKind = tab === 'plugins' ? 'plugin' : 'skill'
    if (!templateName.trim()) return
    if (await createResourceTemplate({
      kind,
      name: templateName.trim(),
      description: templateDescription.trim(),
      scope,
    })) {
      setTemplateName('')
      setTemplateDescription('')
      setCreateOpen(false)
    }
  }

  return (
    <div className="resource-manager">
      <section className="settings-section resource-summary">
        <div className="section-title">
          <div><h3>能力与扩展</h3><p>这里的改动直接写入 Pi 配置，并在当前项目中即时重载。</p></div>
          <div className="resource-summary-actions">
            <button className="secondary-button" type="button" disabled={busy || !project} onClick={() => void reloadResources()}>
              <RefreshCw className={busy ? 'spin' : ''} size={14} />重载
            </button>
            <button className="secondary-button" type="button" disabled={busy || !resources.packages.length} onClick={() => void updateResourcePackage()}>
              <RefreshCw size={14} />全部更新
            </button>
          </div>
        </div>
        <div className="resource-tabs" role="tablist" aria-label="资源类型">
          <button type="button" role="tab" aria-selected={tab === 'skills'} data-active={tab === 'skills' || undefined} onClick={() => setTab('skills')}><Sparkles size={16} /><span>Skills</span><strong>{activeCount.skills}</strong></button>
          <button type="button" role="tab" aria-selected={tab === 'plugins'} data-active={tab === 'plugins' || undefined} onClick={() => setTab('plugins')}><Puzzle size={16} /><span>Plugins</span><strong>{activeCount.plugins}</strong></button>
          <button type="button" role="tab" aria-selected={tab === 'packages'} data-active={tab === 'packages' || undefined} onClick={() => setTab('packages')}><Package size={16} /><span>资源包</span><strong>{activeCount.packages}</strong></button>
        </div>
        {progress ? <div className="resource-progress"><RefreshCw className="spin" size={14} /><span><strong>{progress.message}</strong><small>{progress.source}</small></span></div> : null}
      </section>

      {tab === 'skills' || tab === 'plugins' ? (
        <section className="settings-section resource-browser">
          <div className="section-title">
            <div>
              <h3>{tab === 'skills' ? 'Skills' : 'Plugins'}</h3>
              <p>{tab === 'skills' ? '复用专门指令与工作流，可按项目或全局启停。' : '扩展 Pi 的工具、命令和事件能力。'}</p>
            </div>
            <button className="secondary-button" type="button" onClick={() => setCreateOpen((value) => !value)}><Plus size={14} />新建</button>
          </div>

          {createOpen ? (
            <div className="resource-editor">
              <div className="resource-editor-heading"><span><Plus size={16} />新建 {tab === 'skills' ? 'Skill' : 'Plugin'}</span><button type="button" aria-label="关闭创建表单" onClick={() => setCreateOpen(false)}><X size={15} /></button></div>
              <div className="resource-editor-grid">
                <label><span>名称</span><input value={templateName} placeholder={tab === 'skills' ? 'code-review' : 'my-extension'} onChange={(event) => setTemplateName(event.target.value.toLowerCase().replace(/[^a-z0-9-]/gu, '-'))} /></label>
                <label><span>作用域</span><select value={scope} onChange={(event) => setScope(event.target.value as PersistedScope)}><option value="user">全局</option><option value="project" disabled={!project}>当前项目</option></select></label>
              </div>
              <label><span>描述</span><input value={templateDescription} placeholder="说明用途和触发场景" onChange={(event) => setTemplateDescription(event.target.value)} /></label>
              {tab === 'plugins' ? <div className="resource-security-inline"><ShieldAlert size={15} /><span>Plugin 拥有本机执行权限。模板只创建一个安全的示例命令，打开来源后可继续编辑。</span></div> : null}
              <div className="resource-editor-actions"><button type="button" onClick={() => setCreateOpen(false)}>取消</button><button className="settings-save" type="button" disabled={busy || !templateName.trim()} onClick={() => void createTemplate()}>创建并加载</button></div>
            </div>
          ) : null}

          <div className="resource-list">
            {tab === 'skills'
              ? resources.skills.map((skill) => <SkillRow key={`${skill.scope}:${skill.path}`} skill={skill} busy={busy} onInvoke={onInvokeSkill} onOpen={openResource} onToggle={setResourceEnabled} />)
              : resources.plugins.map((plugin) => <PluginRow key={`${plugin.scope}:${plugin.path}`} plugin={plugin} busy={busy} onOpen={openResource} onToggle={setResourceEnabled} />)}
            {!busy && tab === 'skills' && !resources.skills.length ? <div className="resource-empty"><Sparkles size={22} /><span>还没有发现 Skills</span><small>新建一个，或从资源包安装。</small></div> : null}
            {!busy && tab === 'plugins' && !resources.plugins.length ? <div className="resource-empty"><Puzzle size={22} /><span>还没有加载 Plugins</span><small>新建安全模板，或安装受信任的资源包。</small></div> : null}
          </div>
        </section>
      ) : (
        <section className="settings-section package-manager-section">
          <div className="section-title">
            <div><h3>资源包</h3><p>安装包含 Skills 和 Plugins 的 npm、Git 或本地 Pi Package。</p></div>
            <button className="settings-save" type="button" onClick={() => setInstallOpen((value) => !value)}><PackagePlus size={15} />安装资源包</button>
          </div>

          {installOpen ? (
            <div className="package-installer">
              <div className="resource-security-inline warning"><ShieldAlert size={16} /><span><strong>仅安装你信任的来源</strong><small>Plugins 可执行任意本机代码，Skills 也可能引导 Agent 运行程序或修改文件。</small></span></div>
              <label><span>来源</span><input autoFocus value={packageSource} placeholder="npm:@scope/package@1.0.0、git:github.com/user/repo 或本地路径" onChange={(event) => setPackageSource(event.target.value)} /></label>
              <div className="package-installer-row">
                <label><span>安装到</span><select value={scope} onChange={(event) => setScope(event.target.value as PersistedScope)}><option value="user">全局 · 所有项目</option><option value="project" disabled={!project}>项目 · 当前 worktree</option></select></label>
                <label className="resource-trust-check"><input type="checkbox" checked={trusted} onChange={(event) => setTrusted(event.target.checked)} /><span>我信任并已检查此来源</span></label>
              </div>
              <div className="resource-editor-actions"><button type="button" onClick={() => setInstallOpen(false)}>取消</button><button className="settings-save" type="button" disabled={busy || !trusted || !packageSource.trim()} onClick={() => void installPackage()}><PackagePlus size={15} />安装并加载</button></div>
            </div>
          ) : null}

          <div className="package-list">
            {resources.packages.map((item) => {
              const key = `${item.scope}:${item.source}`
              const armed = removeArmed === key
              return (
                <article className="package-row" key={key}>
                  <span className="resource-card-icon package"><Package size={18} /></span>
                  <div><div><strong>{item.source}</strong><span>{SCOPE_LABEL[item.scope]}</span>{item.filtered ? <span>已筛选</span> : null}</div><small title={item.installedPath}>{item.installedPath ?? '安装位置将在首次解析后显示'}</small></div>
                  <div className="package-actions">
                    <button type="button" disabled={busy} title="更新" aria-label={`更新 ${item.source}`} onClick={() => void updateResourcePackage(item.source)}><RefreshCw size={14} /></button>
                    <button className="danger" type="button" disabled={busy} data-armed={armed || undefined} onBlur={() => setRemoveArmed(undefined)} onClick={() => {
                      if (!armed) { setRemoveArmed(key); return }
                      setRemoveArmed(undefined)
                      void removeResourcePackage(item.source, item.scope)
                    }}><Trash2 size={14} />{armed ? '确认卸载' : '卸载'}</button>
                  </div>
                </article>
              )
            })}
            {!busy && !resources.packages.length ? <div className="resource-empty"><Package size={22} /><span>尚未安装资源包</span><small>本地自动发现的 Skills 与 Plugins 仍会显示在对应标签页。</small></div> : null}
          </div>
        </section>
      )}

      {resources.issues.length ? (
        <section className="settings-section resource-diagnostics">
          <div className="section-title"><div><h3>加载诊断</h3><p>修复来源后点击“重载”即可重新检查。</p></div><AlertTriangle size={18} /></div>
          {resources.issues.map((issue, index) => <button type="button" key={`${issue.path}:${index}`} disabled={!issue.path} onClick={() => issue.path && void openResource(issue.path)}><AlertTriangle size={15} /><span><strong>{issue.type === 'error' ? '错误' : issue.type === 'collision' ? '冲突' : '警告'}</strong><small>{issue.message}</small></span>{issue.path ? <FolderOpen size={14} /> : null}</button>)}
        </section>
      ) : null}
    </div>
  )
}

interface ResourceRowCallbacks {
  busy: boolean
  onOpen: (path: string) => Promise<void>
  onToggle: ReturnType<typeof useAppStore.getState>['setResourceEnabled']
}

function SkillRow({ skill, busy, onInvoke, onOpen, onToggle }: ResourceRowCallbacks & { skill: SkillResource; onInvoke: (name: string) => void }) {
  return (
    <article className="resource-card" data-disabled={!skill.enabled || undefined}>
      <span className="resource-card-icon skill"><Sparkles size={18} /></span>
      <div className="resource-card-body">
        <div className="resource-card-heading"><strong>{skill.name}</strong><span>{SCOPE_LABEL[skill.scope]}</span>{skill.explicitOnly ? <span>手动调用</span> : null}{!skill.enabled ? <span>已停用</span> : null}</div>
        <p>{skill.description || '此 Skill 没有提供描述。'}</p>
        <small title={skill.path}>{skill.source === 'local' ? skill.path : skill.source}</small>
      </div>
      <div className="resource-card-actions">
        <button type="button" disabled={!skill.enabled} onClick={() => onInvoke(skill.name)}><CornerUpRight size={14} />调用</button>
        <button type="button" aria-label={`打开 ${skill.name}`} title="打开来源文件" onClick={() => void onOpen(skill.path)}><FolderOpen size={14} /></button>
        <ResourceSwitch resource={skill} kind="skill" busy={busy} onToggle={onToggle} />
      </div>
    </article>
  )
}

function PluginRow({ plugin, busy, onOpen, onToggle }: ResourceRowCallbacks & { plugin: PluginResource }) {
  return (
    <article className="resource-card" data-disabled={!plugin.enabled || undefined}>
      <span className="resource-card-icon plugin"><Puzzle size={18} /></span>
      <div className="resource-card-body">
        <div className="resource-card-heading"><strong>{plugin.name}</strong><span>{SCOPE_LABEL[plugin.scope]}</span>{plugin.hidden ? <span>隐藏</span> : null}{!plugin.enabled ? <span>已停用</span> : null}</div>
        <p>{plugin.enabled ? `${plugin.tools.length ? `${plugin.tools.length} 个工具` : '无自定义工具'} · ${plugin.commands.length ? `${plugin.commands.length} 个命令` : '无自定义命令'} · ${plugin.shortcuts} 个快捷键` : '当前不会随 Pi 会话加载'}</p>
        {plugin.enabled ? <div className="resource-capabilities">{[...plugin.tools.map((item) => `@${item}`), ...plugin.commands.map((item) => `/${item}`)].slice(0, 6).map((item) => <code key={item}>{item}</code>)}</div> : null}
        <small title={plugin.path}>{plugin.source === 'local' ? plugin.path : plugin.source}</small>
      </div>
      <div className="resource-card-actions">
        <button type="button" aria-label={`打开 ${plugin.name}`} title="打开来源文件" onClick={() => void onOpen(plugin.path)}><FolderOpen size={14} /></button>
        <ResourceSwitch resource={plugin} kind="plugin" busy={busy} onToggle={onToggle} />
      </div>
    </article>
  )
}

function ResourceSwitch({ resource, kind, busy, onToggle }: { resource: SkillResource | PluginResource; kind: ResourceKind } & Pick<ResourceRowCallbacks, 'busy' | 'onToggle'>) {
  if (!resource.manageable) return <span className="resource-managed-label">随运行时加载</span>
  return (
    <button
      className="resource-switch"
      type="button"
      role="switch"
      aria-checked={resource.enabled}
      aria-label={`${resource.enabled ? '停用' : '启用'} ${resource.name}`}
      disabled={busy}
      onClick={() => void onToggle({ ...resource, kind, enabled: !resource.enabled })}
    >
      <span />
      <small>{resource.enabled ? <><Check size={12} />已启用</> : '已停用'}</small>
    </button>
  )
}
