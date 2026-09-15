import {
  Files,
  GitCompareArrows,
  MessageSquareText,
  Settings2,
} from 'lucide-react'
import * as Tooltip from '@radix-ui/react-tooltip'
import type { InspectorTab } from './Inspector'

const destinations = [
  { label: '会话上下文', icon: MessageSquareText, tab: 'context' as const },
  { label: 'Git 变更', icon: GitCompareArrows, tab: 'changes' as const },
  { label: '项目文件', icon: Files, tab: 'files' as const },
]

interface ActivityRailProps {
  activeTab: InspectorTab
  inspectorVisible: boolean
  onOpenSettings: () => void
  onSelectTab: (tab: InspectorTab) => void
}

export function ActivityRail({ activeTab, inspectorVisible, onOpenSettings, onSelectTab }: ActivityRailProps) {
  return (
    <nav className="activity-rail" aria-label="工作面板">
      <div className="activity-items">
        {destinations.map(({ label, icon: Icon, tab }) => (
          <Tooltip.Root key={label} delayDuration={300}>
            <Tooltip.Trigger asChild>
              <button
                className="activity-button"
                data-active={tab && inspectorVisible && activeTab === tab ? true : undefined}
                type="button"
                aria-label={label}
                onClick={() => onSelectTab(tab)}
              >
                <Icon size={19} strokeWidth={1.65} />
              </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content side="right" sideOffset={10} className="tooltip-content">
                {label}
                <Tooltip.Arrow className="tooltip-arrow" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        ))}
      </div>
      <div className="rail-spacer" />
      <Tooltip.Root delayDuration={300}>
        <Tooltip.Trigger asChild>
          <button className="activity-button" type="button" aria-label="配置" onClick={onOpenSettings}>
            <Settings2 size={19} strokeWidth={1.65} />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content side="left" sideOffset={10} className="tooltip-content">配置<Tooltip.Arrow className="tooltip-arrow" /></Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </nav>
  )
}
