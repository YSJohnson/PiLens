import { AlertTriangle, Check, Copy, RefreshCw } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { PiMark } from './PiMark'

interface AppErrorBoundaryProps {
  children: ReactNode
  onReload?: () => void
}

interface AppErrorBoundaryState {
  copied: boolean
  error?: Error
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { copied: false }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { copied: false, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('PiLens renderer failed', error, info.componentStack)
  }

  private readonly reload = () => {
    if (this.props.onReload) this.props.onReload()
    else window.location.reload()
  }

  private readonly copyDiagnostics = async () => {
    const error = this.state.error
    if (!error || !navigator.clipboard?.writeText) return
    try {
      await navigator.clipboard.writeText(`${error.name}: ${error.message}\n${error.stack ?? ''}`.trim())
      this.setState({ copied: true })
    } catch {
      // Reload remains available even when clipboard permission is unavailable.
    }
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <main className="app-error-screen" role="alert">
        <section className="app-error-card">
          <div className="app-error-brand"><PiMark size={34} /><span>PILENS</span></div>
          <span className="app-error-icon"><AlertTriangle size={21} /></span>
          <h1>界面暂时无法继续</h1>
          <p>当前项目和 Pi 会话仍保存在本机。重新加载界面通常即可恢复，不会删除聊天记录。</p>
          <code>{this.state.error.message || '未知的界面错误'}</code>
          <div className="app-error-actions">
            <button type="button" className="error-reload-button" onClick={this.reload}><RefreshCw size={15} />重新加载界面</button>
            <button type="button" onClick={() => void this.copyDiagnostics()}>{this.state.copied ? <Check size={15} /> : <Copy size={15} />}{this.state.copied ? '已复制' : '复制诊断信息'}</button>
          </div>
          <small>若重新加载后仍然出现，请把诊断信息交给开发者。</small>
        </section>
      </main>
    )
  }
}
