import { clsx } from 'clsx'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

// Design-system button (new BizTrack design). Wraps the .btn classes from
// @biztrack/ui/styles.css. Namespaced under @biztrack/ui/biztrack so it does not
// clash with the v1 Button while apps/desktop (v1) still exists.
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
  ...rest
}: ButtonProps) {
  return (
    <button
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
