import * as Dialog from '@radix-ui/react-dialog'
import { ArrowRight, GitBranch, GitFork, History, LoaderCircle, MessageSquareText, X } from 'lucide-react'
import { useState } from 'react'
import { useAppStore } from '../store/use-app-store'

interface SessionBranchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function preview(text: string): string {
  return text.replaceAll(/\s+/g, ' ').trim()
}

export function SessionBranchDialog({ open, onOpenChange }: SessionBranchDialogProps) {
  const forkPoints = useAppStore((state) => state.forkPoints)
  const busy = useAppStore((state) => state.busy)
  const branchSession = useAppStore((state) => state.branchSession)
  const forkSession = useAppStore((state) => state.forkSession)
  const [selectedId, setSelectedId] = useState('')
  const effectiveId = forkPoints.some((point) => point.entryId === selectedId)
    ? selectedId
    : forkPoints.at(-1)?.entryId ?? ''
  const selected = forkPoints.find((point) => point.entryId === effectiveId)

  const run = async (mode: 'branch' | 'fork') => {
    if (!effectiveId) return
    const completed = mode === 'branch'
      ? await branchSession(effectiveId)
      : await forkSession(effectiveId)
    if (completed) onOpenChange(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="session-branch-dialog" aria-describedby="session-branch-description">
          <header className="session-branch-header">
            <span className="session-branch-icon"><GitFork size={19} /></span>
            <div>
              <Dialog.Title>从历史消息继续</Dialog.Title>
              <Dialog.Description id="session-branch-description">选择一条旧提示，在当前会话创建新分支，或 Fork 成完全独立的会话。</Dialog.Description>
            </div>
            <Dialog.Close asChild><button className="icon-button" type="button" aria-label="关闭"><X size={17} /></button></Dialog.Close>
          </header>

          {forkPoints.length ? (
            <div className="session-branch-body">
              <div className="fork-point-list" role="listbox" aria-label="历史用户消息">
                {forkPoints.map((point, index) => (
                  <button
                    key={point.entryId}
                    type="button"
                    role="option"
                    aria-selected={effectiveId === point.entryId}
                    data-active={effectiveId === point.entryId || undefined}
                    onClick={() => setSelectedId(point.entryId)}
                  >
                    <span className="fork-point-index">{String(index + 1).padStart(2, '0')}</span>
                    <span><strong>{preview(point.text)}</strong><small>{new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(point.timestamp)}</small></span>
                    <ArrowRight size={14} />
                  </button>
                ))}
              </div>
              <section className="fork-point-preview">
                <span><MessageSquareText size={15} />所选提示</span>
                <p>{selected?.text}</p>
                <small>继续后，这段文字会回到输入框；你可以先修改，再发送给 Pi。</small>
              </section>
            </div>
          ) : (
            <div className="session-branch-empty"><History size={24} /><strong>还没有可分支的历史消息</strong><p>至少完成一轮对话后，就能从旧提示继续。</p></div>
          )}

          <footer className="session-branch-footer">
            <span>原有历史不会被删除</span>
            <div>
              <button className="secondary-button" type="button" disabled={!effectiveId || busy} onClick={() => void run('branch')}>
                {busy ? <LoaderCircle className="spin" size={14} /> : <GitBranch size={14} />}当前会话分支
              </button>
              <button className="settings-save" type="button" disabled={!effectiveId || busy} onClick={() => void run('fork')}>
                <GitFork size={14} />Fork 独立会话
              </button>
            </div>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
