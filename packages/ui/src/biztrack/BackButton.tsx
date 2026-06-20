'use client'
import type { CSSProperties, ReactNode } from 'react'

export interface BackButtonProps {
  onClick: () => void
  children: ReactNode
  style?: CSSProperties
}

/** Consistent "back" control used on every detail/form page (chevron-left + label). */
export function BackButton({ onClick, children, style }: BackButtonProps) {
  return (
    <button type="button" className="back-btn" onClick={onClick} style={style}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="M15 18l-6-6 6-6" />
      </svg>
      {children}
    </button>
  )
}
