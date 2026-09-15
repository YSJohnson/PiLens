import { Bell, Box, GitBranch, Radio } from 'lucide-react'
import { useAppStore } from '../store/use-app-store'

export function StatusBar() {
  const project = useAppStore((state) => state.project)
  const streaming = useAppStore((state) => state.streaming)
  const demoMode = useAppStore((state) => state.demoMode)
  const version = useAppStore((state) => state.version)

  return (
    <footer className="status-bar">
      <div className="status-left">
        <span className="connection-status"><i /> {demoMode ? '预览桥接' : 'Pi 已连接'}</span>
        {project ? <span title={project.path}><Box size={12} /> {project.path}</span> : null}
        {project?.branch ? <span><GitBranch size={12} /> {project.branch}</span> : null}
        <span><Radio size={12} /> {streaming ? 'Pi 正在工作' : '运行时空闲'}</span>
      </div>
      <div className="status-right">
        <span>UTF-8</span>
        <span>PiLens {version}</span>
        <Bell size={13} />
      </div>
    </footer>
  )
}
