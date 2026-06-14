import { clsx } from 'clsx'
import { forwardRef, type InputHTMLAttributes } from 'react'

// Design-system input (wraps .input from @biztrack/ui/styles.css).
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { error, className, ...rest },
  ref,
) {
  return <input ref={ref} className={clsx('input', error && 'err', className)} {...rest} />
})
