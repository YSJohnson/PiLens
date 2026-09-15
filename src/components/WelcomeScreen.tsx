import { ArrowRight, FolderOpen, History, ShieldCheck, Sparkles } from 'lucide-react'
import { useAppStore } from '../store/use-app-store'
import { PiMark } from './PiMark'

export function WelcomeScreen() {
  const chooseProject = useAppStore((state) => state.chooseProject)
  const openProject = useAppStore((state) => state.openProject)
  const recentProjects = useAppStore((state) => state.recentProjects)

  return (
    <main className="welcome-screen">
      <div className="welcome-glow" />
      <section className="welcome-content">
        <div className="welcome-mark"><PiMark size={48} /></div>
        <h1>让 Pi 在你的项目里工作</h1>
        <p>选择一个本地文件夹，开始一段可追踪、可恢复、工具调用完全可见的编码任务。</p>
        <button className="welcome-primary" type="button" onClick={() => void chooseProject()}>
          <FolderOpen size={17} /> 打开项目 <ArrowRight size={16} />
        </button>
        <div className="welcome-principles">
          <span><ShieldCheck size={15} /> 本地优先</span>
          <span><History size={15} /> 会话持久化</span>
          <span><Sparkles size={15} /> 官方 Pi SDK</span>
        </div>
      </section>

      {recentProjects.length ? (
        <section className="welcome-recent">
          <h2>最近打开</h2>
          {recentProjects.slice(0, 5).map((project) => (
            <button key={project.path} type="button" onClick={() => void openProject(project.path)}>
              <span className="recent-project-icon"><FolderOpen size={16} /></span>
              <span><strong>{project.name}</strong><small>{project.path}</small></span>
              <ArrowRight size={15} />
            </button>
          ))}
        </section>
      ) : null}
    </main>
  )
}
