import {
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  File,
  FileArchive,
  FileCode2,
  Files,
  Folder,
  FolderGit2,
  FolderOpen,
  GitBranch,
  Layers3,
  LoaderCircle,
  Maximize2,
  Minimize2,
  RefreshCw,
  Settings2,
  ShieldCheck,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { desktop } from '../lib/desktop'
import { basename, dirname, formatFileSize, formatMoney, formatTokenCount } from '../lib/format'
import type { FileChange, FileNode } from '../shared/contracts'
import { useAppStore } from '../store/use-app-store'
import { ChangeMetrics } from './ChangeMetrics'
import { ProviderLogo } from './ProviderLogo'

export type InspectorTab = 'changes' | 'files' | 'context'

const CHANGE_STATUS_LABEL: Record<FileChange['status'], string> = {
  modified: '已修改',
  added: '已添加',
  deleted: '已删除',
  renamed: '已重命名',
  untracked: '未跟踪',
}

interface InspectorProps {
  activeTab: InspectorTab
  onClose: () => void
  onOpenProviderSettings: () => void
  onTabChange: (tab: InspectorTab) => void
}

function DiffPreview({ diff }: { diff: string }) {
  const lines = diff.split(/\r?\n/).filter((line) => !line.startsWith('diff --git') && !line.startsWith('index '))
  return (
    <pre className="diff-preview">
      {lines.slice(0, 30).map((line, index) => {
        const kind = line.startsWith('+') && !line.startsWith('+++')
          ? 'added'
          : line.startsWith('-') && !line.startsWith('---')
            ? 'deleted'
            : line.startsWith('@@')
              ? 'hunk'
              : 'context'
        return <span key={`${index}-${line}`} data-kind={kind}>{line || ' '}</span>
      })}
    </pre>
  )
}

function ChangeItem({ change, expanded, onToggle }: { change: FileChange; expanded: boolean; onToggle: () => void }) {
  const previewChange = useAppStore((state) => state.previewChange)
  const directory = dirname(change.path)
  const meta = `${CHANGE_STATUS_LABEL[change.status]}${directory ? ` · ${directory}` : ''}`
  return (
    <section className="change-item" data-expanded={expanded || undefined}>
      <button className="change-row" type="button" onClick={onToggle}>
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {change.binary ? <FileArchive className="file-type-icon" size={15} /> : <FileCode2 className="file-type-icon" size={15} />}
        <span className="change-file-copy"><strong>{basename(change.path)}</strong><small title={meta}>{meta}</small></span>
        <ChangeMetrics change={change} />
      </button>
      {expanded ? (
        <div className="change-detail">
          {change.binary ? (
            <div className="binary-diff-note"><FileArchive size={18} /><span><strong>二进制文件</strong><small>{formatFileSize(change.size)} · Git 不提供行级 Diff</small></span></div>
          ) : change.diff ? (
            <><DiffPreview diff={change.diff} />{change.diffTruncated ? <p className="diff-truncated-note">仅显示前一部分差异。</p> : null}</>
          ) : change.large ? (
            <p className="diff-empty">文件较大，已跳过行级统计和内联 Diff。可在默认编辑器中打开。</p>
          ) : (
            <p className="diff-empty">这个变更没有可显示的行级差异。</p>
          )}
          {change.previousPath ? <p className="rename-origin">原路径：<code>{change.previousPath}</code></p> : null}
          <div className="change-detail-actions">
            {!change.binary && change.diff ? <button className="open-file-button" type="button" onClick={() => previewChange(change.path)}><Maximize2 size={13} />预览完整 Diff</button> : null}
            {change.status !== 'deleted' ? <button className="open-file-button" type="button" onClick={() => void desktop.openWorkspaceFile(change.path)}>在默认编辑器中打开</button> : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}

function ChangesPanel() {
  const changes = useAppStore((state) => state.changes)
  const refreshWorkspace = useAppStore((state) => state.refreshWorkspace)
  const [expandedPath, setExpandedPath] = useState<string | undefined>()
  const totals = useMemo(
    () => changes.reduce((sum, change) => ({
      additions: sum.additions + change.additions,
      deletions: sum.deletions + change.deletions,
      binaries: sum.binaries + (change.binary ? 1 : 0),
    }), { additions: 0, deletions: 0, binaries: 0 }),
    [changes],
  )
  const lineChanges = totals.additions + totals.deletions

  return (
    <div className="inspector-panel changes-panel">
      <section className="inspector-card change-overview-card">
        <div className="inspector-section-header">
          <div><span>工作区变更</span><small>{changes.length} 个文件等待检查{totals.binaries ? ` · ${totals.binaries} 个二进制` : ''}</small></div>
          <button className="icon-button" type="button" onClick={() => void refreshWorkspace()} aria-label="刷新变更"><RefreshCw size={15} /></button>
        </div>
        <div className="change-stats">
          {totals.additions ? <span className="diff-count added">+{totals.additions}</span> : null}
          {totals.deletions ? <span className="diff-count deleted">−{totals.deletions}</span> : null}
          {totals.binaries ? <span className="change-kind-badge binary">{totals.binaries} BIN</span> : null}
          {!lineChanges && !totals.binaries ? <span className="change-kind-badge neutral">无行级变更</span> : null}
        </div>
        <div className="change-balance" data-empty={!lineChanges || undefined} aria-hidden="true"><span style={{ width: `${lineChanges ? (totals.additions / lineChanges) * 100 : 0}%` }} /></div>
      </section>
      <div className="change-list">
        {changes.map((change) => (
          <ChangeItem
            key={change.path}
            change={change}
            expanded={expandedPath === change.path}
            onToggle={() => setExpandedPath((path) => path === change.path ? undefined : change.path)}
          />
        ))}
        {!changes.length ? <p className="panel-empty">工作区很干净，没有未提交的变更。</p> : null}
      </div>
    </div>
  )
}

function TreeNode({ node, depth = 0 }: { node: FileNode; depth?: number }) {
  const [open, setOpen] = useState(depth < 1)
  const previewFile = useAppStore((state) => state.previewFile)
  const isDirectory = node.kind === 'directory'
  const FolderIcon = open ? FolderOpen : Folder
  return (
    <div className="tree-node">
      <button
        type="button"
        className="tree-row"
        style={{ paddingLeft: `${10 + depth * 15}px` }}
        aria-label={isDirectory ? `${open ? '收起' : '展开'} ${node.name}` : `预览 ${node.name}`}
        title={isDirectory ? undefined : '在 PiLens 中预览'}
        onClick={() => isDirectory ? setOpen((value) => !value) : void previewFile(node.path)}
      >
        {isDirectory ? open ? <ChevronDown size={13} /> : <ChevronRight size={13} /> : <span className="tree-spacer" />}
        {isDirectory ? <FolderIcon size={15} /> : <File size={14} />}
        <span>{node.name}</span>
      </button>
      {isDirectory && open ? node.children?.map((child) => <TreeNode key={child.path} node={child} depth={depth + 1} />) : null}
    </div>
  )
}

function FilesPanel() {
  const files = useAppStore((state) => state.files)
  return (
    <div className="inspector-panel files-panel">
      <section className="inspector-card">
        <div className="inspector-section-header"><div><span>项目文件</span><small>依赖与构建目录已隐藏</small></div><Files size={16} /></div>
        {files.length ? (
          <div className="file-tree">{files.map((node) => <TreeNode key={node.path} node={node} />)}</div>
        ) : (
          <div className="panel-empty panel-empty-with-icon">
            <Files size={18} />
            <span>这个项目里还没有可显示的文件。</span>
          </div>
        )}
      </section>
    </div>
  )
}

function countFiles(nodes: FileNode[]): number {
  return nodes.reduce((total, node) => total + (node.kind === 'file' ? 1 : countFiles(node.children ?? [])), 0)
}

function ContextPanel({ onOpenProviderSettings }: { onOpenProviderSettings: () => void }) {
  const stats = useAppStore((state) => state.stats)
  const compaction = useAppStore((state) => state.compaction)
  const project = useAppStore((state) => state.project)
  const files = useAppStore((state) => state.files)
  const changes = useAppStore((state) => state.changes)
  const providers = useAppStore((state) => state.providers)
  const modelKey = useAppStore((state) => state.modelKey)
  const thinkingLevel = useAppStore((state) => state.thinkingLevel)
  const busy = useAppStore((state) => state.busy)
  const streaming = useAppStore((state) => state.streaming)
  const compactSession = useAppStore((state) => state.compactSession)
  const model = useAppStore((state) => state.models.find((item) => item.key === modelKey))
  const percent = Math.max(0, Math.min(100, stats.contextPercent ?? 0))
  const connectedProviders = providers.filter((provider) => provider.authenticated)

  return (
    <div className="inspector-panel context-panel">
      <section className="inspector-card session-card">
        <div className="context-heading">
          <span>上下文</span>
          <div className="context-heading-meta">
            <span>{Math.round(percent)}% · {formatMoney(stats.cost)}</span>
            <button type="button" disabled={busy || streaming || !stats.contextTokens} onClick={() => void compactSession()} aria-label="压缩上下文" title={streaming ? 'Pi 完成当前回复后可压缩' : '压缩上下文'}>
              {busy ? <LoaderCircle className="spin" size={13} /> : <Minimize2 size={13} />}
            </button>
          </div>
        </div>
        <div className="context-progress"><span style={{ width: `${percent}%` }} /></div>
        <div className="context-token-row"><span>{stats.contextTokens === null ? '未知' : formatTokenCount(stats.contextTokens)}</span><span>{formatTokenCount(stats.contextWindow)} tokens</span></div>
        <div className="compaction-status" data-active={compaction.active || undefined}>
          {compaction.active ? <LoaderCircle className="spin" size={13} /> : <Minimize2 size={13} />}
          <span>{compaction.active ? '正在压缩上下文' : compaction.count ? `已压缩 ${compaction.count} 次` : '尚未压缩'}</span>
          {compaction.lastTokensBefore ? <small>{formatTokenCount(compaction.lastTokensBefore)} → 摘要</small> : null}
        </div>
      </section>

      <section className="inspector-card">
        <div className="inspector-card-title"><span>项目</span><FolderGit2 size={16} /></div>
        <dl className="compact-details">
          <div><dt>名称</dt><dd>{project?.name ?? '未打开'}</dd></div>
          <div><dt>分支</dt><dd><GitBranch size={13} />{project?.branch ?? '—'}</dd></div>
          <div><dt>变更</dt><dd>{changes.length} 个文件</dd></div>
        </dl>
      </section>

      <section className="inspector-card">
        <div className="inspector-card-title"><span>当前会话</span><CircleDollarSign size={16} /></div>
        <div className="current-model-row">
          <ProviderLogo providerId={model?.provider} providerName={model?.providerName} size={30} className="inspector-provider-logo" />
          <span><strong>{model?.name ?? '尚未选择模型'}</strong><small>{model?.providerName ?? '请配置 Provider'}</small></span>
          <i data-connected={model?.authenticated || undefined} />
        </div>
        <dl className="compact-details usage-details">
          <div><dt>输入</dt><dd>{formatTokenCount(stats.inputTokens)}</dd></div>
          <div><dt>输出</dt><dd>{formatTokenCount(stats.outputTokens)}</dd></div>
          <div><dt>缓存</dt><dd>{formatTokenCount(stats.cacheReadTokens)}</dd></div>
          <div><dt>思考</dt><dd>{thinkingLevel}</dd></div>
        </dl>
      </section>

      <section className="inspector-card">
        <div className="inspector-card-title">
          <span>Provider 状态</span>
          <button className="inspector-card-action" type="button" onClick={onOpenProviderSettings} aria-label="管理 Provider" title="管理 Provider"><Settings2 size={14} /></button>
        </div>
        <div className="provider-status-list">
          {connectedProviders.map((provider) => (
            <div key={provider.id}>
              <span className="provider-identity"><ProviderLogo providerId={provider.id} providerName={provider.name} size={21} /><strong>{provider.name}</strong></span>
              <span className="provider-online"><i />在线</span>
            </div>
          ))}
          {!connectedProviders.length ? (
            <div className="provider-empty-state"><ShieldCheck size={18} /><span>尚未连接 Provider</span><button type="button" onClick={onOpenProviderSettings}>前往设置</button></div>
          ) : null}
        </div>
      </section>

      <section className="inspector-card">
        <div className="inspector-card-title"><span>上下文来源</span><Layers3 size={16} /></div>
        <dl className="compact-details">
          <div><dt>项目文件</dt><dd>{countFiles(files)} 项</dd></div>
          <div><dt>代码变更</dt><dd>{changes.length} 项</dd></div>
          <div><dt>已连接 Provider</dt><dd>{connectedProviders.length} 个</dd></div>
        </dl>
      </section>
    </div>
  )
}

const TAB_LABELS: Record<InspectorTab, string> = {
  context: '会话',
  changes: '变更',
  files: '文件',
}

export function Inspector({ activeTab, onClose, onOpenProviderSettings, onTabChange }: InspectorProps) {
  return (
    <aside className="inspector">
      <header className="inspector-header">
        <strong>{TAB_LABELS[activeTab]}</strong>
        <div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭检查器"><X size={16} /></button>
        </div>
      </header>
      <nav className="inspector-tabs" aria-label="检查器板块">
        {(['context', 'changes', 'files'] as InspectorTab[]).map((tab) => (
          <button key={tab} type="button" data-active={activeTab === tab || undefined} onClick={() => onTabChange(tab)}>{TAB_LABELS[tab]}</button>
        ))}
      </nav>
      {activeTab === 'context' ? <ContextPanel onOpenProviderSettings={onOpenProviderSettings} /> : null}
      {activeTab === 'changes' ? <ChangesPanel /> : null}
      {activeTab === 'files' ? <FilesPanel /> : null}
    </aside>
  )
}
