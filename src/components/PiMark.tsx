import type { CSSProperties } from 'react'
import piIcon from '../assets/pi-icon.png'

interface PiMarkProps {
  size?: number
  className?: string
  label?: string
}

export function PiMark({ size = 32, className = '', label = '' }: PiMarkProps) {
  const style = { '--pi-mark-size': `${size}px` } as CSSProperties
  return (
    <img
      className={`pi-mark ${className}`.trim()}
      src={piIcon}
      alt={label}
      draggable={false}
      style={style}
    />
  )
}
