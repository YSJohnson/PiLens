import type { FileChange } from '../shared/contracts'

export function ChangeMetrics({ change }: { change: FileChange }) {
  if (change.binary) return <span className="change-kind-badge binary">BIN</span>
  if (change.large) return <span className="change-kind-badge large">大文件</span>
  if (!change.additions && !change.deletions) {
    return <span className="change-kind-badge neutral">{change.status === 'untracked' || change.status === 'added' ? '空文件' : '无行变更'}</span>
  }
  return (
    <span className="change-metrics">
      {change.additions ? <span className="diff-count added">+{change.additions}</span> : null}
      {change.deletions ? <span className="diff-count deleted">−{change.deletions}</span> : null}
    </span>
  )
}
