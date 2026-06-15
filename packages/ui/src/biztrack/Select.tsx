import { clsx } from 'clsx'
import { forwardRef, type SelectHTMLAttributes } from 'react'

// Design-system native select (wraps .select from @biztrack/ui/styles.css). A
// searchable/creatable variant can come later; this covers simple choice fields.
export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean
  options?: SelectOption[]
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { error, className, options, children, ...rest },
  ref,
) {
  return (
    <span className={clsx('select-wrap', error && 'invalid')}>
      <select ref={ref} className={clsx('select', error && 'err', className)} {...rest}>
        {options ? options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>) : children}
      </select>
      <svg className="select-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="m6 9 6 6 6-6" />
      </svg>
    </span>
  )
})
