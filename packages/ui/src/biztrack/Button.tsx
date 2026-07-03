import { clsx } from 'clsx'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

// Design-system button (new BizTrack design). Wraps the .btn classes from
// @biztrack/ui/styles.css. Namespaced under @biztrack/ui/biztrack to keep it
// separate from the legacy top-level Button export.
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'default' | 'ghost' | 'soft'
  block?: boolean
  loading?: boolean
  children?: ReactNode
}

export function Button({
  variant = 'default',
  block,
  loading,
  className,
  children,
  disabled,
  // Default to "button" so a Button inside a <form> never submits by accident —
  // only an explicit type="submit" does.
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={clsx(
        'btn',
        variant === 'primary' && 'btn-primary',
        variant === 'ghost' && 'btn-ghost',
        variant === 'soft' && 'btn-soft',
        block && 'btn-block',
        loading && 'loading',
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {children}
    </button>
  )
}
