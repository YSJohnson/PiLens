import type { DesktopBridge } from '../shared/contracts'
import { createDemoBridge } from './demo-bridge'

export const desktop: DesktopBridge = window.piDesktop ?? createDemoBridge()
